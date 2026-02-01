import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { tempDir, join } from "@tauri-apps/api/path";

export async function openGraphInBrowser(graph: any) {
  if (!graph || !graph.nodes?.length) {
    console.error("Graph empty");
    return;
  }

  try {
    const tempPath = await tempDir();
    const filename = `graph-${Date.now()}.json`;
    const filePath = await join(tempPath, filename);

    const jsonContent = JSON.stringify(graph);

    await writeTextFile(filePath, jsonContent);


    const label = `code-graph-${Date.now()}`;

    const win = new WebviewWindow(label, {
      url: `/graph-viewer.html?path=${encodeURIComponent(filePath)}`,
      title: "Code Graph",
      width: 1200,
      height: 800,
      resizable: true,
    });

    win.once("tauri://created", () => {
      console.log("Graph window created");
    });

    win.once("tauri://error", (e) => {
      console.error("Window error", e);
    });
  } catch (err) {
    console.error("Failed to write graph file", err);
  }
}
