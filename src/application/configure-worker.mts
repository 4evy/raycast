import { configureFile } from "./configure.mts";

const configFile = process.argv[2];
if (!configFile) throw new Error("configuration file is required");
process.stdout.write(JSON.stringify(await configureFile(configFile)));
