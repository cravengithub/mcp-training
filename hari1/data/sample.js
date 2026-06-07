// sample.js - Contoh kode untuk dianalisis
function calculateTotal(items) {
    let total = 0;
    for (let i = 0; i <= items.length; i++) { // Bug: seharusnya <
        total = total + items[i].price;
    }
    return total;
}
function getUserData(id) {
    // Tidak ada validasi input
    const query = "SELECT * FROM users WHERE id = " + id; // SQL injection
    return executeQuery(query);
}
// Variable tidak digunakan
let unusedVariable = 10;