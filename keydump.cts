const { installDatabaseKeyDump } = require(
	__filename.endsWith(".cts")
		? "./src/platform/key/hook.cts"
		: "./src/platform/key/hook.cjs",
) as {
	installDatabaseKeyDump: (keyFile?: string) => void;
};

installDatabaseKeyDump();
