const { installDatabaseKeyDump } = require(
	__filename.endsWith(".cts")
		? "./src/platform/keydump-hook.cts"
		: "./src/platform/keydump-hook.cjs",
) as {
	installDatabaseKeyDump: (keyFile?: string) => void;
};

installDatabaseKeyDump();
