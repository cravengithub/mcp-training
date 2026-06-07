#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from 'fs/promises';
import path from 'path';
const server = new McpServer({
    name: "tools-demo-server",
    version: "1.0.0"
});
// ============ TOOL 1: Ping ============
server.tool(
    "ping",
    "Send a ping to check if server is alive",
    {}, // Tidak ada parameter
    async () => ({
        content: [{ type: "text", text: "pong" }]
    })
);
// ============ TOOL 2: Echo ============
server.tool(
    "echo",
    "Echo back the input message",
    {
        message: z.string().describe("Message to echo back")
    },
    async ({ message }) => ({
        content: [{ type: "text", text: `Echo: ${message}` }]
    })
);
// ============ TOOL 3: Add Numbers ============
server.tool(
    "add",
    "Add two numbers together",
    {
        a: z.number().describe("First number"),
        b: z.number().describe("Second number")
    },
    async ({ a, b }) => {
        const result = a + b;
        return {
            content: [{ type: "text", text: `${a} + ${b} = ${result}` }]
        };
    }
);
// ============ TOOL 4: Create File ============
server.tool(
    "create_file",
    "Create a new file in the filesystem",
    {
        filePath: z.string().min(1).max(500).describe("Full path of the file to create"),
        content: z.string().optional().default("").describe("File content (optional)"),
        overwrite: z.boolean().optional().default(false).describe("Overwrite if file exists"),
        createDir: z.boolean().optional().default(false).describe("Create parent directory if not exists")
    },
    async ({ filePath, content, overwrite, createDir }) => {
        try {
            // Validasi tambahan: cegah path traversal
            const normalizedPath = path.normalize(filePath);
            if (normalizedPath.includes('..')) {
                return {
                    content: [{ type: "text", text: "Error: Path traversal not allowed" }],
                    isError: true
                };
            }
            // Cek apakah file sudah ada
            const fileExists = await fs.access(normalizedPath).then(() => true).catch(() => false);
            if (fileExists && !overwrite) {
                return {
                    content: [{
                        type: "text", text: `Error: File ${normalizedPath} already exists. Use overwrite=true to replace.`
                    }],
                    isError: true
                };
            }
            // Buat direktori parent jika diperlukan
            if (createDir) {
                const dir = path.dirname(normalizedPath);
                await fs.mkdir(dir, { recursive: true });
            }
            // Tulis file
            await fs.writeFile(normalizedPath, content, 'utf-8');
            return {
                content: [
                    { type: "text", text: `✅ File created successfully: ${normalizedPath}` },
                    { type: "text", text: `📝 Size: ${content.length} characters` }
                ]
            };
        } catch (error: unknown) {
            return {
                content: [{ type: "text", text: `❌ Error creating file: ${(error as Error).message}` }],
                isError: true
            };
        }
    }
);
// =========== tooL 5 Write info to a log file ============
server.tool(
    "write_log",
    "Write a log entry to a log file",
    {
        logMessage: z.string().min(1).max(1000).describe("Log message to write"),
        logLevel: z.enum(["info", "warning", "error"]).describe("Log level"),
        logFilePath: z.string().min(1).max(500).describe("Path of the log file")
    },
    async ({ logMessage, logLevel, logFilePath }) => {
        try {
            // Validasi tambahan: cegah path traversal
            const normalizedPath = path.normalize(logFilePath);
            if (normalizedPath.includes('..')) {
                return {
                    content: [{ type: "text", text: "Error: Path traversal not allowed" }],
                    isError: true
                };
            }
            // Tulis log ke file (append)
            await fs.appendFile(normalizedPath, `${new Date().toISOString()} - [${logLevel.toUpperCase()}] ${logMessage}\n`, 'utf-8');
            return {
                content: [{ type: "text", text: `✅ Log written successfully to ${normalizedPath}` }]
            };
        } catch (error: unknown) {
            return {
                content: [{ type: "text", text: `❌ Error writing log: ${(error as Error).message}` }],
                isError: true
            };
        }
    }
);
// =========== TOOL 6: Read Log File ============
server.tool(
    "read_log",
    "Read the contents of a log file",
    {
        logFilePath: z.string().min(1).max(500).describe("Path of the log file to read")
    },
    async ({ logFilePath }) => {
        try {
            // Validasi tambahan: cegah path traversal
            const normalizedPath = path.normalize(logFilePath);
            let lineCount = 0;
            if (normalizedPath.includes('..')) {
                return {
                    content: [{ type: "text", text: "Error: Path traversal not allowed" }],
                    isError: true
                };
            }
            // Baca file log
            const logContent = await fs.readFile(normalizedPath, 'utf-8');
            lineCount = logContent.split('\n').length - 1;
            return {
                content: [
                    { type: "text", text: `📄 Log file content (${lineCount} lines):` },
                    { type: "text", text: logContent }
                ]
            };
        } catch (error: unknown) {
            return {
                content: [{ type: "text", text: `❌ Error reading log file: ${(error as Error).message}` }],
                isError: true
            };
        }
    }
);

// ============ START SERVER ============
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("✅ Tools Demo Server running");
    console.error("🔧 Available tools: ping, echo, add");
}
main().catch(console.error);