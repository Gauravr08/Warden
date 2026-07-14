import type { Tool } from "@modelcontextprotocol/sdk/types.js";

interface Entry {
  server: string;
  original: string;
  def: Tool;
}

export class ToolRegistry {
  private byExposed = new Map<string, Entry>();

  refresh(toolsByServer: Map<string, Tool[]>): void {
    const counts = new Map<string, number>();
    for (const tools of toolsByServer.values()) {
      for (const t of tools) counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
    }
    this.byExposed.clear();
    for (const [server, tools] of toolsByServer) {
      for (const t of tools) {
        const exposed = (counts.get(t.name) ?? 0) > 1 ? `${server}__${t.name}` : t.name;
        if (this.byExposed.has(exposed)) {
          console.error(`[warden] duplicate tool name "${exposed}" (server ${server}) — keeping first, dropping duplicate`);
          continue;
        }
        this.byExposed.set(exposed, { server, original: t.name, def: { ...t, name: exposed } });
      }
    }
  }

  list(): Tool[] {
    return [...this.byExposed.values()].map((e) => e.def);
  }

  resolve(exposedName: string): { server: string; tool: string } | undefined {
    const e = this.byExposed.get(exposedName);
    return e ? { server: e.server, tool: e.original } : undefined;
  }
}
