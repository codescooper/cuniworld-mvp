export const $ = (id) => document.getElementById(id);

export function getEls() {
  return {
    dash: $("dash"),
    q: $("q"),
    sexFilter: $("sexFilter"),
    statusFilter: $("statusFilter"),
    rabbitList: $("rabbitList"),
    rabbitDetails: $("rabbitDetails"),
    eventsPanel: $("eventsPanel"),

    btnNewRabbit: $("btnNewRabbit"),
    btnExport: $("btnExport"),
    fileImport: $("fileImport"),
    btnReset: $("btnReset"),

    modal: $("modal"),
    modalTitle: $("modalTitle"),
    modalBody: $("modalBody"),
    modalClose: $("modalClose"),

    lotQ: $("lotQ"),
    lotList: $("lotList"),
    lotDetails: $("lotDetails"),
    geneQ: $("geneQ"),
    geneGraph: $("geneGraph"),
    geneList: $("geneList"),

  };
}
