import { config } from "dotenv";

// parse .env file
config();

export const env = {
  // er
  ER_API_KEY: process.env.ER_API_KEY ?? "",
};
