import { describe, it, expect, beforeEach } from "vitest";
import { renderLots } from "../src/render.js";
import { lotIdForLitter } from "../src/lots.js";

function _state() {
  return {
    rabbits: [
      { id: "F1", code: "CW-F001", name: "Naya", sex: "F", status: "actif", cage: "A1" },
      { id: "k1", litterId: "mb1", doeId: "F1", code: "CW-F001-K01", name: "L1", sex: "F", status: "actif", cage: "A1", birthDate: "2026-04-01" },
      { id: "k2", litterId: "mb1", doeId: "F1", code: "CW-F001-K02", name: "L2", sex: "M", status: "actif", cage: "A1", birthDate: "2026-04-01" },
    ],
    events: [
      { id: "mb1", rabbitId: "F1", type: "mise_bas", date: "2026-04-01", data: { born: 3, alive: 2, dead: 1 } },
    ],
    lotStatuses: {},
  };
}

function _ctx(state, selectedLotId = null) {
  return {
    state,
    selectedLotId,
    lotStatusFilter: "",
    el: {
      lotList: document.getElementById("lotList"),
      lotDetails: document.getElementById("lotDetails"),
      lotQ: null,
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = `
    <div id="panel-lots">
      <div id="lotSummary"></div>
      <div id="lotFilterChips"></div>
      <div id="lotList"></div>
      <div id="lotDetails"></div>
    </div>`;
});

describe("renderLots — liste + filtres", () => {
  it("rend une carte par lot avec cage et vivants", () => {
    renderLots(_ctx(_state()));
    const cards = document.querySelectorAll("#lotList [data-lot]");
    expect(cards.length).toBe(1);
    const html = document.getElementById("lotList").innerHTML;
    expect(html).toContain("A1");
    expect(html).toContain("2 vivants");
  });

  it("rend le bandeau résumé et les puces de filtre", () => {
    renderLots(_ctx(_state()));
    expect(document.querySelectorAll("#lotSummary .lot-sum-cell").length).toBe(4);
    expect(document.querySelectorAll("#lotFilterChips [data-lot-filter]").length).toBe(6);
  });
});

describe("renderLots — détail", () => {
  it("affiche stepper, KPI, tableau lapereaux et parents", () => {
    renderLots(_ctx(_state(), lotIdForLitter("mb1")));
    const det = document.getElementById("lotDetails").innerHTML;
    expect(document.querySelector("#lotDetails .lot-stepper")).toBeTruthy();
    expect(document.querySelector("#lotDetails .lot-kits")).toBeTruthy();
    expect(det).toContain("Naya (CW-F001)");
    expect(det).toContain("2 lapereaux");
    // boutons d'action présents
    expect(document.getElementById("btnLotLoss")).toBeTruthy();
    expect(document.getElementById("btnLotAddKits")).toBeTruthy();
  });

  it("ajoute la classe lot-selected au panneau quand un lot est sélectionné", () => {
    renderLots(_ctx(_state(), lotIdForLitter("mb1")));
    expect(document.getElementById("panel-lots").classList.contains("lot-selected")).toBe(true);
  });
});
