import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";

describe("package metadata", () => {
	it("supports React 18 and 19 type packages", () => {
		expect(packageJson.peerDependencies).toMatchObject({
			"@types/react": "^18.0.0 || ^19.0.0",
			"@types/react-dom": "^18.0.0 || ^19.0.0",
			react: "^18.0.0 || ^19.0.0",
		});
	});
});
