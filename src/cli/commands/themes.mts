import { installThemes } from "../../public/v1/index.mts";
export async function runThemes(file: string): Promise<void> {
	const { changed } = await installThemes(file);
	console.log(
		changed ? "Raycast themes installed" : "Raycast themes already current",
	);
}
