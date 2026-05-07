import { describe, it, expect } from "vitest";
import { buildGenealogyGraph } from "../src/genealogy3d.js";

function makeRabbit(overrides) {
  return { id: "r0", code: "CW-X000", name: "Lapin", sex: "U", status: "actif", ...overrides };
}

describe("buildGenealogyGraph", () => {
  it("retourne vide si pas de lapins", () => {
    const { nodes, edges } = buildGenealogyGraph({ rabbits: [] });
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it("crée des nodes sans edges pour des lapins sans liens", () => {
    const state = {
      rabbits: [
        makeRabbit({ id: "A", name: "Alfa", code: "CW-A001" }),
        makeRabbit({ id: "B", name: "Beta", code: "CW-B001" }),
      ],
    };
    const { nodes, edges } = buildGenealogyGraph(state);
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(0);
    nodes.forEach(n => expect(n.generation).toBe(0));
  });

  it("construit les edges mère→enfant et père→enfant", () => {
    const state = {
      rabbits: [
        makeRabbit({ id: "M", name: "Mère",  code: "CW-F001", sex: "F" }),
        makeRabbit({ id: "P", name: "Père",  code: "CW-M001", sex: "M" }),
        makeRabbit({ id: "K1", name: "Kit1", code: "CW-F001-K01", sex: "U", doeId: "M", buckId: "P" }),
        makeRabbit({ id: "K2", name: "Kit2", code: "CW-F001-K02", sex: "U", doeId: "M", buckId: "P" }),
      ],
    };
    const { nodes, edges } = buildGenealogyGraph(state);
    expect(nodes).toHaveLength(4);

    const motherEdges = edges.filter(e => e.type === "mother");
    const fatherEdges = edges.filter(e => e.type === "father");
    expect(motherEdges).toHaveLength(2);
    expect(fatherEdges).toHaveLength(2);

    expect(motherEdges.every(e => e.from === "M")).toBe(true);
    expect(fatherEdges.every(e => e.from === "P")).toBe(true);

    const kitIds = ["K1", "K2"];
    expect(motherEdges.map(e => e.to).sort()).toEqual(kitIds.sort());
  });

  it("assigne des générations correctes", () => {
    const state = {
      rabbits: [
        makeRabbit({ id: "G",  name: "Grand-mère", code: "CW-G001", sex: "F" }),
        makeRabbit({ id: "M",  name: "Mère",       code: "CW-M001", sex: "F", doeId: "G" }),
        makeRabbit({ id: "K",  name: "Kit",        code: "CW-K001", sex: "U", doeId: "M" }),
      ],
    };
    const { nodes } = buildGenealogyGraph(state);
    const byId = new Map(nodes.map(n => [n.id, n]));
    expect(byId.get("G").generation).toBe(0);
    expect(byId.get("M").generation).toBe(1);
    expect(byId.get("K").generation).toBe(2);
  });

  it("remplit parentIds, childIds et siblingIds", () => {
    const state = {
      rabbits: [
        makeRabbit({ id: "M", sex: "F" }),
        makeRabbit({ id: "K1", doeId: "M", litterId: "litter1" }),
        makeRabbit({ id: "K2", doeId: "M", litterId: "litter1" }),
      ],
    };
    const { nodes } = buildGenealogyGraph(state);
    const byId = new Map(nodes.map(n => [n.id, n]));

    expect(byId.get("M").childIds.sort()).toEqual(["K1", "K2"]);
    expect(byId.get("K1").parentIds).toEqual(["M"]);
    expect(byId.get("K1").siblingIds).toEqual(["K2"]);
    expect(byId.get("K2").siblingIds).toEqual(["K1"]);
  });

  it("les positions sont déterministes (même résultat sur deux appels)", () => {
    const state = {
      rabbits: [
        makeRabbit({ id: "A" }),
        makeRabbit({ id: "B", doeId: "A" }),
      ],
    };
    const r1 = buildGenealogyGraph(state);
    const r2 = buildGenealogyGraph(state);
    expect(r1.nodes[0].x).toBe(r2.nodes[0].x);
    expect(r1.nodes[0].z).toBe(r2.nodes[0].z);
  });

  it("ignore les parentIds dont les lapins ne sont pas dans le dataset", () => {
    const state = {
      rabbits: [
        makeRabbit({ id: "K", doeId: "INCONNU_ID", buckId: "AUTRE_INCONNU" }),
      ],
    };
    const { nodes, edges } = buildGenealogyGraph(state);
    expect(edges).toHaveLength(0);
    expect(nodes[0].parentIds).toHaveLength(0);
  });
});
