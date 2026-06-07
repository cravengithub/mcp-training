// src/transaction-operations.ts
import { getDB, Account, Transaction, dbLogger, supportsTransactions } from './database-advanced.js';
import { ClientSession } from 'mongodb';

/**
* Transfer uang antar account menggunakan MongoDB Transaction
*
* @param fromAccountId - ID account pengirim
* @param toAccountId - ID account penerima
* @param amount - Jumlah transfer
* @param currency - Mata uang (default: IDR)
*/
export async function transferMoney(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    currency: string = 'IDR'
): Promise<{ success: boolean; message: string }> {
    const db = await getDB();
    const accountsCollection = db.collection<Account>('accounts');
    const transactionsCollection = db.collection<Transaction>('transactions');
    // Validasi awal
    if (amount <= 0) {
        return { success: false, message: "Amount must be greater than 0" };
    }

    const canUseTransactions = await supportsTransactions();
    if (!canUseTransactions) {
        const message =
            "MongoDB transactions require a replica set member or mongos. " +
            "Current deployment does not support transactions. " +
            "Run MongoDB as a replica set or use a cluster topology that supports transactions.";
        dbLogger.warn("Transaction aborted due to unsupported MongoDB topology", {
            fromAccountId,
            toAccountId,
            amount
        });
        return { success: false, message };
    }

    const session = db.client.startSession();
    try {
        let result: { success: boolean; message: string } = { success: false, message: "" };
        // Gunakan callback API dengan built-in retry logic
        await session.withTransaction(async () => {
            dbLogger.info("Starting transaction", { fromAccountId, toAccountId, amount });
            // 1. Cek account pengirim
            const fromAccount = await accountsCollection.findOne(
                { accountId: fromAccountId },
                { session }
            );
            if (!fromAccount) {
                throw new Error(`Sender account ${fromAccountId} not found`);
            }
            // 2. Cek account penerima
            const toAccount = await accountsCollection.findOne(
                { accountId: toAccountId },
                { session }
            );
            if (!toAccount) {
                throw new Error(`Recipient account ${toAccountId} not found`);
            }
            // 3. Cek saldo
            if (fromAccount.balance < amount) {
                throw new Error(`Insufficient balance. Available: ${fromAccount.balance}, Required: ${amount}`);
            }
            // 4. Update saldo pengirim (debit)
            const debitResult = await accountsCollection.updateOne(
                { accountId: fromAccountId },
                { $inc: { balance: -amount } },
                { session }
            );
            // 5. Update saldo penerima (credit)
            const creditResult = await accountsCollection.updateOne(
                { accountId: toAccountId },
                { $inc: { balance: amount } },
                { session }
            );
            // 6. Catat transaksi
            const transactionRecord: Transaction = {
                fromAccount: fromAccountId,
                toAccount: toAccountId,
                amount,
                currency,
                timestamp: new Date(),
                status: 'completed'
            };
            await transactionsCollection.insertOne(transactionRecord, { session });
            dbLogger.info("Transaction operations completed", {
                debitMatched: debitResult.matchedCount,
                creditMatched: creditResult.matchedCount
            });
            result = {
                success: true,
                message: `Successfully transferred ${amount} ${currency} from ${fromAccountId} to ${toAccountId}`
            };
        });
        return result;
    } catch (error) {
        const err = error as Error;
        dbLogger.error("Transaction failed", err, {
            fromAccountId,
            toAccountId,
            amount
        });
        // Cek jenis error untuk memberikan pesan yang sesuai
        if (err.message.includes("not found")) {
            return { success: false, message: err.message };
        }
        if (err.message.includes("Insufficient balance")) {
            return { success: false, message: err.message };
        }
        return {
            success: false,
            message: `Transaction failed: ${err.message}`
        };
    } finally {
        await session.endSession();
        dbLogger.info("Transaction session ended");
    }
}
/**
* Mendapatkan saldo account
*/
export async function getBalance(accountId: string): Promise<number | null> {
    try {
        const db = await getDB();
        const account = await db.collection<Account>('accounts').findOne({ accountId });
        return account ? account.balance : null;
    } catch (error) {
        dbLogger.error("Failed to get balance", error as Error, { accountId });
        throw error;
    }
}
/**
* Mendapatkan history transaksi
*/
export async function
    getTransactionHistory(accountId:
        string,
        limit:
            number
            =
            10):
    Promise<Transaction[]> {
    try {
        const db = await getDB();
        const transactions = await db.collection<Transaction>('transactions')
            .find({
                $or: [
                    { fromAccount: accountId },
                    { toAccount: accountId }
                ]
            })
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
        return transactions;
    } catch (error) {
        dbLogger.error("Failed to get transaction history", error as Error, { accountId });
        throw error;
    }
}