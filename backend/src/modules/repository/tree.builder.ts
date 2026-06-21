import { TreeNode } from "@shared/types";

export class TreeBuilder {
  static buildTree(filePaths: string[], rootName: string = "root"): TreeNode {
    const root: TreeNode = {
      name: rootName,
      path: "",
      type: "directory",
      children: [],
    };

    for (const filePath of filePaths) {
      // Standardize paths to use forward slashes
      const cleanPath = filePath.replace(/\\/g, "/");
      const parts = cleanPath.split("/");
      let current = root;

      let accumulatedPath = "";

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;

        accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
        const isLast = i === parts.length - 1;

        if (!current.children) {
          current.children = [];
        }

        let child = current.children.find((c) => c.name === part);

        if (!child) {
          child = {
            name: part,
            path: accumulatedPath,
            type: isLast ? "file" : "directory",
            children: isLast ? undefined : [],
          };
          current.children.push(child);
        }

        current = child;
      }
    }

    // Sort folders before files, then alphabetically
    const sortNodes = (node: TreeNode) => {
      if (node.children) {
        node.children.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === "directory" ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
        node.children.forEach(sortNodes);
      }
    };

    sortNodes(root);
    return root;
  }
}
