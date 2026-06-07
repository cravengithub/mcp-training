#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import * as dotenv from "dotenv";
import process from "process";
import { logger, createChildLogger, logToolCall, logError } from './logger.js';
import fs from "fs/promises";

dotenv.config();
// ============ KONFIGURASI ============
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const WEATHER_API_URL = process.env.WEATHER_API_URL || "https://api.openweathermap.org/data/3.0";
const DEFAULT_CITY = process.env.DEFAULT_CITY || "Jakarta";
// Validasi API key
if (!WEATHER_API_KEY) {
    console.error("⚠️ WARNING: WEATHER_API_KEY not set. Weather tool will use mock data.");
}
// ============ INIT SERVER ============
const server = new McpServer({
    name: "api-tools-server",
    version: "1.0.0"
});
// ============ TOOL 1: Weather Info ============
// ============ TOOL 1: Weather Info (Revisi dengan One Call API) ============
server.tool(
    "get_weather",
    "Get current weather information for geographic coordinates. Returns temperature, humidity, conditions, and other weather data.",
    {
        lat: z.number().min(-90).max(90).describe("Latitude coordinate (e.g., -6.2 for Jakarta)"),
        lon: z.number().min(-180).max(180).describe("Longitude coordinate (e.g., 106.8 for Jakarta)"),
        cityName: z.string().optional().describe("Optional city name for display (not used in API call)"),
        units: z.enum(["metric", "imperial", "standard"]).default("metric").describe("Units: metric (Celsius), imperial (Fahrenheit), standard (Kelvin)")
    },
    async ({ lat, lon, cityName, units }) => {
        const startTime = Date.now();
        const toolLogger = createChildLogger({ tool: 'get_weather', cityName: cityName, lat, lon });

        toolLogger.info({ units }, 'Weather request started');


        try {
            // Validasi API key
            if (!WEATHER_API_KEY) {
                return {
                    content: [
                        { type: "text", text: "⚠️  [MOCK DATA] Weather API key not configured." },
                        { type: "text", text: `📍 Location: ${cityName || `${lat}, ${lon}`}` },
                        { type: "text", text: `🌡️  Temperature: ${units === 'metric' ? '28°C' : (units === 'imperial' ? '82°F' : '301K')}` },
                        { type: "text", text: `💧 Humidity: 65%` },
                        { type: "text", text: `☁️  Conditions: Partly cloudy` },
                        { type: "text", text: "\n💡 To get real data, set WEATHER_API_KEY in .env file" }
                    ]
                };
            }

            // Build parameter untuk One Call API
            const params: any = {
                lat: lat,
                lon: lon,
                appid: WEATHER_API_KEY,
                units: units,
                exclude: 'minutely,hourly,alerts'  // Mengurangi ukuran respons
            };

            // Panggil One Call API
            const response = await axios.get(`${WEATHER_API_URL}/onecall`, {
                params: params,
                timeout: 10000,
                headers: {
                    'User-Agent': 'MCP-Server/1.0'
                }
            });

            const duration = Date.now() - startTime;
            const data = response.data;
            const current = data.current;

            // Format waktu lokal
            const localTime = new Date((current.dt + data.timezone_offset) * 1000);

            // Konversi satuan untuk tampilan
            const tempUnit = units === 'metric' ? '°C' : (units === 'imperial' ? '°F' : 'K');
            const speedUnit = units === 'imperial' ? 'mph' : 'm/s';

            // Format response
            const weatherText = `
🌍 Weather Information for ${cityName || `${lat}, ${lon}`}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Coordinates: ${lat}, ${lon}
🕐 Local Time: ${localTime.toLocaleString()}
🌐 Timezone: ${data.timezone} (UTC${data.timezone_offset / 3600 > 0 ? '+' : ''}${data.timezone_offset / 3600})

🌡️  Temperature: ${current.temp}${tempUnit}
   └─ Feels like: ${current.feels_like}${tempUnit}
   └─ Min/Max: ${data.daily?.[0]?.temp?.min || 'N/A'}${tempUnit} / ${data.daily?.[0]?.temp?.max || 'N/A'}${tempUnit}

💧 Humidity: ${current.humidity}%
💨 Wind Speed: ${current.wind_speed} ${speedUnit}
   └─ Wind Direction: ${current.wind_deg}°${current.wind_gust ? ` (Gust: ${current.wind_gust} ${speedUnit})` : ''}

☁️  Conditions: ${current.weather[0].description}
🔆 Pressure: ${current.pressure} hPa
👁️  Visibility: ${(current.visibility / 1000).toFixed(1)} km
☁️  Cloudiness: ${current.clouds}%
🌅 Sunrise: ${new Date((current.sunrise + data.timezone_offset) * 1000).toLocaleTimeString()}
🌇 Sunset: ${new Date((current.sunset + data.timezone_offset) * 1000).toLocaleTimeString()}

📊 Data source: OpenWeatherMap One Call API 3.0
⏱️  Response time: ${duration}ms
      `.trim();
            const durationMs = Date.now() - startTime;
            logToolCall('get_weather', { lat, lon, cityName, units }, durationMs);

            return {
                content: [{ type: "text", text: weatherText }]
            };

        } catch (error: any) {
            const duration = Date.now() - startTime;
            logError(error, { lat, lon, cityName, units, duration });
            if (axios.isAxiosError(error)) {
                if (error.code === 'ECONNABORTED') {
                    return {
                        content: [{ type: "text", text: `❌ Request timeout after 10 seconds. Please try again.` }],
                        isError: true
                    };
                }

                if (error.response?.status === 400) {
                    return {
                        content: [{ type: "text", text: `❌ Invalid coordinates: lat=${lat}, lon=${lon}. Must be within lat: -90 to 90, lon: -180 to 180.` }],
                        isError: true
                    };
                }

                if (error.response?.status === 401) {
                    return {
                        content: [{ type: "text", text: `❌ Invalid API key. Please check your WEATHER_API_KEY in .env file.` }],
                        isError: true
                    };
                }

                if (error.response?.status === 429) {
                    return {
                        content: [{ type: "text", text: `❌ Rate limit exceeded. Free tier allows 1000 calls per day.` }],
                        isError: true
                    };
                }
            }

            return {
                content: [{ type: "text", text: `❌ Failed to get weather: ${error.message}` }],
                isError: true
            };
        }
    }
);
// ============ TOOL 1b: Weather by City Name (dengan Geocoding) ============
server.tool(
    "get_weather_by_city",
    "Get current weather information by city name. Converts city name to coordinates using Geocoding API.",
    {
        city: z.string().describe("City name (e.g., Jakarta, London, Tokyo)"),
        units: z.enum(["metric", "imperial", "standard"]).default("metric")
    },
    async ({ city, units }) => {
        try {
            // Step 1: Geocoding - konversi kota ke koordinat
            const geoResponse = await axios.get('http://api.openweathermap.org/geo/1.0/direct', {
                params: {
                    q: city,
                    limit: 1,
                    appid: WEATHER_API_KEY
                },
                timeout: 5000
            });

            if (!geoResponse.data || geoResponse.data.length === 0) {
                return {
                    content: [{ type: "text", text: `❌ City "${city}" not found. Please check the city name.` }],
                    isError: true
                };
            }

            const { lat, lon, name, country } = geoResponse.data[0];

            // Step 2: Panggil One Call API dengan koordinat
            const weatherResponse = await axios.get(`${WEATHER_API_URL}/onecall`, {
                params: {
                    lat, lon,
                    appid: WEATHER_API_KEY,
                    units: units,
                    exclude: 'minutely,hourly,alerts'
                },
                timeout: 10000
            });

            const current = weatherResponse.data.current;
            const tempUnit = units === 'metric' ? '°C' : (units === 'imperial' ? '°F' : 'K');

            const weatherText = `
🌍 Weather: ${name}, ${country}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌡️  Temperature: ${current.temp}${tempUnit}
   └─ Feels like: ${current.feels_like}${tempUnit}
💧 Humidity: ${current.humidity}%
💨 Wind: ${current.wind_speed} ${units === 'imperial' ? 'mph' : 'm/s'}
☁️  Conditions: ${current.weather[0].description}
      `.trim();

            return { content: [{ type: "text", text: weatherText }] };

        } catch (error: any) {
            return {
                content: [{ type: "text", text: `❌ Error: ${error.message}` }],
                isError: true
            };
        }
    }
);

// ============ TOOL 2: Server Status Check ============
server.tool(
    "check_server",
    "Check if a server/website is accessible. Returns status code and response time.",
    {
        url: z.string().url().describe("Full URL to check (e.g., https://google.com)"),
        timeout:
            z.number().min(1000).max(30000).default(5000).describe("Timeout in milliseconds (default: 5000)"),
    },
    async ({ url, timeout }) => {
        const startTime = Date.now();
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                headers: { 'User-Agent': 'MCP-Server/1.0' }
            });
            clearTimeout(timeoutId);
            const duration = Date.now() - startTime;
            const statusIcon = response.ok ? '✅' : '⚠️';
            const statusText = response.statusText || (response.ok ? 'OK' : 'Error');
            const resultText = `
${statusIcon} Server Status Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 URL: ${url}
📊 Status: ${response.status} ${statusText}
⏱️ Response Time: ${duration} ms
🏷️ Server: ${response.headers.get('server') || 'Unknown'}
📅 Last Modified: ${response.headers.get('last-modified') || 'Not available'}
${response.ok ? '✅ Server is accessible and responding normally.' : '⚠️ Server returned a non-OK status.'}
`.trim();
            return {
                content: [{ type: "text", text: resultText }]
            };
        } catch (error: any) {
            const duration = Date.now() - startTime;
            if (error.name === 'AbortError') {
                return {
                    content: [{
                        type: "text", text: `❌ Request timeout after ${timeout} ms.Server may be down or very slow.`
                    }],
                    isError: true
                };
            }
            return {
                content: [{ type: "text", text: `❌ Cannot reach ${url}: ${error.message} ` }],
                isError: true
            };
        }
    }
);
// ============ TOOL 3: Activity Suggestion (No API Key) ============
server.tool(
    "suggest_activity",
    "Get a random activity suggestion when bored (uses BoredAPI)",
    {
        type:
            z.enum(["education",
                "recreational",
                "social",
                "diy",
                "charity",
                "cooking",
                "relaxation", "music", "busywork"]).optional()
                .describe("Filter activity by type (optional)")
    },
    async ({ type }) => {
        try {
            let url = "https://bored-api.appbrewery.com/random";
            if (type) {
                url = `https://bored-api.appbrewery.com/filter?type=${type}`;
            }
            const response = await axios.get(url, {
                timeout: 8000,
                headers: { 'User-Agent': 'MCP-Server/1.0' }
            });
            // Handle response (array jika filter, object jika random)
            const activities = Array.isArray(response.data) ? response.data : [response.data];
            if (activities.length === 0) {
                return {
                    content: [{
                        type: "text", text: `No activities found for type: ${type}. Try a different
type.` }]
                };
            }
            const activity = activities[0];
            const resultText = `
🎯 Activity Suggestion
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 ${activity.activity}
📂 Type: ${activity.type}
👥 Participants: ${activity.participants}
💰 Price: ${activity.price === 0 ? 'Free!' : `$${activity.price}`}
🔗 Link: ${activity.link || 'No link provided'}
🎉 Accessibility: ${(activity.accessibility * 100).toFixed(0)}% (lower = more accessible)
`.trim();
            return {
                content: [{ type: "text", text: resultText }]
            };
        } catch (error) {
            // Fallback activities if API fails
            const fallbackActivities = [
                "Learn a new programming language",
                "Go for a walk outside",
                "Read a book for 30 minutes",
                "Try cooking a new recipe",
                "Do a 10-minute meditation",
                "Organize your desktop/files",
                "Write a thank you note to someone",
                "Do a quick workout"
            ];
            const random = fallbackActivities[Math.floor(Math.random() * fallbackActivities.length)];
            return {
                content: [
                    { type: "text", text: "⚠️ Using fallback activities (API unavailable)" },
                    { type: "text", text: `💡 ${random}` }
                ]
            };
        }
    }
);
// ============ TOOL 4: Retry Demo ============
server.tool(
    "demo_retry",
    "Demonstrate retry mechanism by calling an unreliable endpoint",
    {},
    async () => {
        let attempts = 0;
        const maxRetries = 3;
        let lastError: Error;
        for (attempts = 1; attempts <= maxRetries; attempts++) {
            try {
                // Unreliable endpoint (sometimes fails)
                const response = await axios.get('https://httpbin.org/status/200,404,500,200', {
                    timeout: 5000,
                    validateStatus: () => true // Don't throw on non-2xx
                });
                if (response.status === 200) {
                    return {
                        content: [
                            {
                                type: "text", text: `✅ Request succeeded on attempt ${attempts}/${maxRetries}`
                            },
                            { type: "text", text: "🎉 Retry mechanism works!" }
                        ]
                    };
                }
                throw new Error(`HTTP ${response.status}`);
            } catch (error) {
                lastError = error as Error;
                if (attempts < maxRetries) {
                    const delay = Math.pow(2, attempts - 1) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        return {
            content:
                [{
                    type:
                        "text",
                    text:
                        `❌ Failed after ${maxRetries} retries: ${lastError!.message}`
                }],
            isError: true
        };
    }
);
// ============ TOOL 5: Ping ============
server.tool("ping", "Health check", {}, async () => ({
    content: [{ type: "text", text: "pong" }]
}));

// ============ TOOL 6: Legacy API Adapter Demo ============
// Simulasi legacy API yang merespons dengan format tidak baku
interface LegacyWeatherResponse {
    status_code: number;
    response_body: {
        city_name: string;
        temp_celsius: number;
        humidity_percent: number;
        weather_desc: string;
        server_time: number; // Unix timestamp
    };
    message: string;
}

// Adapter: transform legacy format ke format standar
interface LegacyWeatherAdapterSuccess {
    success: true;
    data: {
        city: string;
        temperature: number;
        unit: 'Celsius';
        humidity: number;
        conditions: string;
        timestamp: string;
    };
}

interface LegacyWeatherAdapterError {
    success: false;
    error: string;
}

function legacyAdapter(legacy: LegacyWeatherResponse): LegacyWeatherAdapterSuccess | LegacyWeatherAdapterError {
    if (legacy.status_code !== 200) {
        return {
            success: false,
            error: legacy.message || 'Unknown error'
        };
    }

    return {
        success: true,
        data: {
            city: legacy.response_body.city_name,
            temperature: legacy.response_body.temp_celsius,
            unit: 'Celsius',
            humidity: legacy.response_body.humidity_percent,
            conditions: legacy.response_body.weather_desc,
            timestamp: new Date(legacy.response_body.server_time * 1000).toISOString()
        }
    };
}

// Simulasi call ke legacy API
async function callLegacyWeatherAPI(city: string): Promise<LegacyWeatherResponse> {
    // Simulasi delay network
    await new Promise(resolve => setTimeout(resolve, 500));

    // Simulasi response legacy
    return {
        status_code: 200,
        response_body: {
            city_name: city,
            temp_celsius: 28,
            humidity_percent: 70,
            weather_desc: 'Sunny with clouds',
            server_time: Math.floor(Date.now() / 1000)
        },
        message: 'Success'
    };
}

server.tool(
    "legacy_weather",
    "Get weather using legacy API adapter pattern. Demonstrates transforming old API format to standard format.",
    {
        city: z.string().describe("City name")
    },
    async ({ city }) => {
        try {
            // Call legacy API
            const legacyResponse = await callLegacyWeatherAPI(city);

            // Transform dengan adapter
            const adapted = legacyAdapter(legacyResponse);

            if (!adapted.success) {
                return {
                    content: [{ type: "text", text: `❌ Legacy API error: ${adapted.error}` }],
                    isError: true
                };
            }

            return {
                content: [
                    { type: "text", text: "✅ Legacy API response transformed via Adapter Pattern" },
                    { type: "text", text: `📍 City: ${adapted.data.city}` },
                    { type: "text", text: `🌡️  Temperature: ${adapted.data.temperature}°${adapted.data.unit}` },
                    { type: "text", text: `💧 Humidity: ${adapted.data.humidity}%` },
                    { type: "text", text: `☁️  Conditions: ${adapted.data.conditions}` },
                    { type: "text", text: `🕐 Timestamp: ${adapted.data.timestamp}` }
                ]
            };

        } catch (error: any) {
            return {
                content: [{ type: "text", text: `❌ Error: ${error.message}` }],
                isError: true
            };
        }
    }
);

// ============ GRACEFUL SHUTDOWN ============
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
    if (isShuttingDown) {
        logger.warn({ signal }, 'Already shutting down, ignoring duplicate signal');
        return;
    }

    isShuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown initiated');

    // Force shutdown setelah timeout
    const forceShutdownTimeout = setTimeout(() => {
        logger.error('Force shutdown due to timeout');
        process.exit(1);
    }, 10000);

    try {
        // 1. Stop menerima request baru
        logger.info('Stopping server...');
        await server.close(); // Jika server memiliki method close

        // 2. Tutup koneksi database
        logger.info('Closing database connections...');
        // await closeDB(); // Uncomment jika punya database

        // 3. Flush log
        logger.info('Flushing logs...');
        await logger.flush();

        clearTimeout(forceShutdownTimeout);
        logger.info('Graceful shutdown completed successfully');
        process.exit(0);

    } catch (error) {
        logger.error({ error }, 'Error during graceful shutdown');
        clearTimeout(forceShutdownTimeout);
        process.exit(1);
    }
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C

// Uncaught exception handler
process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
    gracefulShutdown('uncaughtException');
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    gracefulShutdown('unhandledRejection');
});

// ============ HEALTH CHECK ENDPOINT ============
import express from 'express';
import path from "path";

const healthApp = express();
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '3001');

// Health check endpoint
healthApp.get('/health', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        },
        version: process.env.npm_package_version || '1.0.0',
        pid: process.pid
    };

    logger.debug('Health check requested');
    res.json(health);
});

// Readiness endpoint (untuk Kubernetes style)
healthApp.get('/ready', (req, res) => {
    // Cek dependensi (database, API key, dll)
    const ready = {
        ready: true,
        checks: {
            database: true, // ganti dengan cek database actual
            apiKey: !!process.env.WEATHER_API_KEY
        }
    };
    res.json(ready);
});

// Start health check server
healthApp.listen(HEALTH_PORT, () => {
    logger.info({ port: HEALTH_PORT }, 'Health check endpoint started');
});


// ============ CRASH SIMULATION TOOL ============
let crashCounter = 0;
const CRASH_AFTER = parseInt(process.env.CRASH_AFTER || '0');

server.tool(
    "simulate_crash",
    "Simulate a crash for testing recovery. WARNING: This will terminate the server!",
    {
        confirm: z.boolean().describe("Must be set to true to simulate crash")
    },
    async ({ confirm }) => {
        if (!confirm) {
            return {
                content: [{ type: "text", text: "⚠️ Set confirm=true to simulate crash" }]
            };
        }

        crashCounter++;
        logger.fatal({ crashCount: crashCounter }, "🔥 Simulating crash as requested!");

        // Force crash setelah delay agar response sempat terkirim
        setTimeout(() => {
            process.exit(1);
        }, 100);

        return {
            content: [{ type: "text", text: "🔥 Crashing in 100ms..." }]
        };
    }
);

// Tool yang secara otomatis crash setelah N kali dipanggil
server.tool(
    "auto_crash",
    "Automatically crashes after N calls (for testing recovery)",
    {},
    async () => {
        crashCounter++;
        logger.info({ callCount: crashCounter, crashAfter: CRASH_AFTER }, "Auto crash tool called");

        if (CRASH_AFTER > 0 && crashCounter >= CRASH_AFTER) {
            logger.fatal({ callCount: crashCounter }, "🔥 Auto-crash triggered!");
            setTimeout(() => process.exit(1), 100);
        }

        return {
            content: [{ type: "text", text: `Call ${crashCounter}/${CRASH_AFTER || '∞'}` }]
        };
    }
);

// ============ CONFIG MANAGEMENT TOOLS ============

// Resource untuk baca config
server.resource(
    "config",
    "config://app",
    async (uri) => {
        try {
            const configPath = path.join(process.cwd(), 'data', 'config.json');
            const content = await fs.readFile(configPath, 'utf-8');
            return {
                contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: content
                }]
            };
        } catch (error: any) {
            throw new Error(`Failed to read config: ${error.message}`);
        }
    }
);

// Tool untuk update config
server.tool(
    "update_config",
    "Update configuration values",
    {
        updates: z.record(z.string(), z.any()).describe("Object with key-value pairs to update"),
        confirm: z.boolean().default(false).describe("Confirm the update operation")
    },
    async ({ updates, confirm }) => {
        if (!confirm) {
            return {
                content: [{ type: "text", text: "⚠️ Update not confirmed. Set confirm=true to proceed." }]
            };
        }

        try {
            // const configPath = path.join(process.cwd(), 'data', 'config.json');
            const configPath = path.join(process.cwd(), 'data', 'config.json');
            // const content = await fs.readFile(configPath, 'utf-8');
            const content = await fs.readFile(configPath, 'utf-8');
            const config = JSON.parse(content);

            // Apply updates
            const oldValues: Record<string, any> = {};
            for (const [key, value] of Object.entries(updates)) {
                oldValues[key] = config[key];
                config[key] = value;
            }

            // Update timestamp
            config.lastUpdated = new Date().toISOString();

            // Save back
            await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

            return {
                content: [
                    { type: "text", text: "✅ Configuration updated successfully" },
                    { type: "text", text: `📝 Updates applied: ${JSON.stringify(updates, null, 2)}` },
                    { type: "text", text: `🕐 Last updated: ${config.lastUpdated}` }
                ]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `❌ Failed to update config: ${error.message}` }],
                isError: true
            };
        }
    }
);

// Tool untuk baca config (alternative)
server.tool(
    "get_config",
    "Read current configuration",
    {},
    async () => {
        try {
            const configPath = path.join(process.cwd(), 'data', 'config.json');
            console.error(`📂 Reading config from ${configPath}`);
            const content = await fs.readFile(configPath, 'utf-8');
            const config = JSON.parse(content);

            return {
                content: [
                    { type: "text", text: "📋 Current Configuration:" },
                    { type: "text", text: JSON.stringify(config, null, 2) }
                ]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `❌ Failed to read config: ${error.message}` }],
                isError: true
            };
        }
    }
);

// =========== read_file_secure Tool ===========
server.tool(
    "read_file_secure",
    "Read a file from the server with path validation to prevent directory traversal",
    {
        filePath: z.string().describe("Relative path to the file within the allowed directory (e.g., 'logs/app.log')")
    },
    async ({ filePath }) => {
        try {
            const baseDir = path.join(process.cwd(), 'data'); // Directory yang diizinkan
            const resolvedPath = path.resolve(baseDir, filePath);

            // Validasi path untuk mencegah directory traversal
            if (!resolvedPath.startsWith(baseDir)) {
                return {
                    content: [{ type: "text", text: "❌ Invalid file path. Access denied." }],
                    isError: true
                };
            }

            const content = await fs.readFile(resolvedPath, 'utf-8');
            return {
                content: [
                    { type: "text", text: `📄 Content of ${filePath}:` },
                    { type: "text", text: content }
                ]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `❌ Failed to read file: ${error.message}` }],
                isError: true
            };
        }
    }
);
// =========== write_file_secure Tool ===========
server.tool(
    "write_file_secure",
    "Write content to a file on the server with path validation to prevent directory traversal",
    {
        filePath: z.string().describe("Relative path to the file within the allowed directory (e.g., 'logs/app.log')"),
        content: z.string().describe("Content to write to the file")
    },
    async ({ filePath, content }) => {
        try {
            const baseDir = path.join(process.cwd(), 'data'); // Directory yang diizinkan
            const resolvedPath = path.resolve(baseDir, filePath);

            // Validasi path untuk mencegah directory traversal
            if (!resolvedPath.startsWith(baseDir)) {
                return {
                    content: [{ type: "text", text: "❌ Invalid file path. Access denied." }],
                    isError: true
                };
            }

            await fs.writeFile(resolvedPath, content, 'utf-8');
            return {
                content: [
                    { type: "text", text: `✅ Successfully wrote to ${filePath}` }
                ]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `❌ Failed to write file: ${error.message}` }],
                isError: true
            };
        }
    }
);


// ============ MAIN ============
async function main() {
    console.error("🚀 API Tools Server starting...");
    console.error(`🌤️ Weather API: ${WEATHER_API_KEY ? 'Configured ✅' : 'Not configured (using mock) ⚠️'}`);
    console.error(`🌐 Default city: ${DEFAULT_CITY}`);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("✅ API Tools Server is running");
    console.error("🔧 Available tools:");
    console.error(" - get_weather: Get weather for any city");
    console.error(" - check_server: Check server/website status");
    console.error(" - suggest_activity: Get activity suggestions");
    console.error(" - demo_retry: Demonstrate retry mechanism");
    console.error(" - ping: Health check");
}
main().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
});