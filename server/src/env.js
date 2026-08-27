import fs from "node:fs";
import dotenv from "dotenv";

dotenv.config({ path: fs.existsSync(".env.local") ? ".env.local" : ".env" });
