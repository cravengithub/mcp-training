#!/usr/bin/env node
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const fs = require('fs/promises');
const { validateSecurePath, validateFilename } = require('./security-validator.js');
const server = new McpServer({
    name: "secure-tools-server",
    version: "1.0.0"
});
// ============ TOOL 1: Baca File (Aman) ============
server.tool(
    "read_file_secure",
    "Read content of a file (with security validation)",
    {
        filePath: z.string().describe("Path to the file to read")
    },
    async ({ filePath }: { filePath: string }) => {
        // Validasi keamanan
        const validation = await validateSecurePath(filePath, { checkExtension: true });
        if (!validation.valid) {
            return {
                content: [{ type: "text", text: `❌ Security Error: ${validation.error}` }],
                isError: true
            };
        }
        try {
            const content = await fs.readFile(validation.resolvedPath!, 'utf-8');
            return {
                content: [
                    { type: "text", text: `✅ File read successfully: ${filePath}` },
                    {
                        type: "text", text: `📄 Content:\n${content.substring(0, 2000)}${content.length > 2000
                            ? '\n... (truncated)' : ''}`
                    }
                ]
            };
        } catch (error: unknown) {
            return {
                content: [{ type: "text", text: `❌ Read error: ${(error as Error).message}` }],
                isError: true
            };
        }
    }
);
// ============ TOOL 2: Tulis File (Aman) ============
server.tool(
    "write_file_secure",
    "Write content to a file (with security validation)",
    {
        filePath: z.string().describe("Path to the file to write"),
        content: z.string().describe("Content to write"),
        append: z.boolean().default(false).describe("Append to file instead of overwrite")
    },
    async ({ filePath, content, append }: { filePath: string; content: string; append: boolean }) => {
        // Validasi keamanan
        const validation = await validateSecurePath(filePath, { writeOperation: true });
        if (!validation.valid) {
            return {
                content: [{ type: "text", text: `❌ Security Error: ${validation.error}` }],
                isError: true
            };
        }
        try {
            if (append) {
                await fs.appendFile(validation.resolvedPath!, content, 'utf-8');
            } else {
                await fs.writeFile(validation.resolvedPath!, content, 'utf-8');
            }
            return {
                content: [{ type: "text", text: `✅ File written successfully: ${filePath}` }]
            };
        } catch (error: unknown) {
            return {
                content: [{ type: "text", text: `❌ Write error: ${(error as Error).message}` }],
                isError: true
            };
        }
    }
);
// ============ TOOL 3: List Directory (Aman) ============
server.tool(
    "list_directory_secure",
    "List contents of a directory (with security validation)",
    {
        dirPath: z.string().describe("Directory path to list")
    },
    async ({ dirPath }: { dirPath: string }) => {
        // Validasi keamanan
        const validation = await validateSecurePath(dirPath);
        if (!validation.valid) {
            return {
                content: [{ type: "text", text: `❌ Security Error: ${validation.error}` }],
                isError: true
            };
        }
        try {
            const files = await fs.readdir(validation.resolvedPath!);
            const fileList = files.map((f: string) => ` - ${f}`).join('\n');
            return {
                content: [
                    { type: "text", text: `📁 Directory: ${dirPath}` },
                    { type: "text", text: `📄 Contents (${files.length} items):\n${fileList}` }
                ]
            };
        } catch (error: unknown) {
            return {
                content: [{ type: "text", text: `❌ List error: ${(error as Error).message}` }],
                isError: true
            };
        }
    }
);
// ============ TOOL 4: Ping ============
server.tool("ping", "Health check", {}, async () => ({
    content: [{ type: "text", text: "pong" }]
}));
// ============ MAIN ============
async function main() {
    console.error("🔒 Secure MCP Server starting...");
    console.error(`📁 Allowed directories:`);
    console.error(` - ${process.cwd()}/data`);
    console.error(` - ${process.cwd()}/logs`);
    console.error(` - ${process.cwd()}/temp`);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("✅ Secure MCP Server is running");
}
main().catch(console.error);