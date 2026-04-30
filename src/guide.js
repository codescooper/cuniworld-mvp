// Guide interactif pour tutoriel complet
export const GUIDE_STEPS = [
  {
    id: "step-1",
    title: "Créer une femelle",
    description: "Commençons par créer une femelle (doe). Clique sur '+ Nouveau lapin'",
    action: "createRabbit",
    params: { code: "CW-F001", name: "Mère", sex: "F" },
    highlight: "#btnNewRabbit",
    validation: (state) => state.rabbits.some(r => r.sex === "F" && r.status === "actif"),
    nextButtonText: "Femelle créée ✓"
  },
  {
    id: "step-2",
    title: "Créer un mâle",
    description: "Créons maintenant un mâle (buck). Clique sur '+ Nouveau lapin'",
    action: "createRabbit",
    params: { code: "CW-M001", name: "Père", sex: "M" },
    highlight: "#btnNewRabbit",
    validation: (state) => state.rabbits.some(r => r.sex === "M" && r.status === "actif"),
    nextButtonText: "Mâle créé ✓"
  },
  {
    id: "step-3",
    title: "Sélectionner la femelle",
    description: "Clique sur la femelle (CW-F001) dans la liste pour voir ses détails",
    action: "selectRabbit",
    validation: (state, ctx) => ctx?.selectedRabbitId && state.rabbits.find(r => r.id === ctx.selectedRabbitId)?.sex === "F",
    nextButtonText: "Femelle sélectionnée ✓"
  },
  {
    id: "step-4",
    title: "Ajouter une saillie",
    description: "Clique sur '+ Ajouter un événement' et ajoute une saillie avec le mâle",
    action: "addEvent",
    params: { type: "saillie", date: "2026-01-01", maleId: true },
    highlight: "#btnAddEvent",
    validation: (state, ctx) => {
      const rabbit = state.rabbits.find(r => r.id === ctx?.selectedRabbitId);
      return rabbit && state.events.some(e => e.rabbitId === rabbit.id && e.type === "saillie");
    },
    nextButtonText: "Saillie ajoutée ✓"
  },
  {
    id: "step-5",
    title: "Voir la gestation",
    description: "Observe la section 'Gestation en cours' qui montre le mâle et la date de terme",
    action: "observe",
    highlight: "#gestationBlock",
    validation: (state, ctx) => {
      const rabbit = state.rabbits.find(r => r.id === ctx?.selectedRabbitId);
      return rabbit && state.events.some(e => e.rabbitId === rabbit.id && e.type === "saillie");
    },
    nextButtonText: "Compris ✓"
  },
  {
    id: "step-6",
    title: "Ajouter une mise-bas",
    description: "Ajoute une mise-bas (>=31 jours après la saillie). Clique '+ Ajouter un événement'",
    action: "addEvent",
    params: { type: "mise_bas", date: "2026-02-01", born: 8, alive: 7 },
    highlight: "#btnAddEvent",
    validation: (state, ctx) => {
      const rabbit = state.rabbits.find(r => r.id === ctx?.selectedRabbitId);
      return rabbit && state.events.some(e => e.rabbitId === rabbit.id && e.type === "mise_bas");
    },
    nextButtonText: "Mise-bas ajoutée ✓"
  },
  {
    id: "step-7",
    title: "7 lapereaux créés automatiquement",
    description: "La mise-bas a créé 7 lapereaux automatiquement ! Vois-les dans la liste avec les codes CW-KIT-...",
    action: "observe",
    highlight: "#rabbitList",
    validation: (state) => state.rabbits.filter(r => r.stage === "kit").length >= 7,
    nextButtonText: "Lapereaux visibles ✓"
  },
  {
    id: "step-8",
    title: "Voir la généalogie",
    description: "Sélectionne un lapereau (CW-KIT-...) et vois sa généalogie (Mère/Père)",
    action: "selectRabbit",
    validation: (state, ctx) => {
      const rabbit = state.rabbits.find(r => r.id === ctx?.selectedRabbitId);
      return rabbit && rabbit.stage === "kit";
    },
    nextButtonText: "Généalogie visible ✓"
  },
  {
    id: "step-9",
    title: "Revenir à la mère",
    description: "Clique '← Retour' ou sur le lien de la mère pour revenir aux détails de la femelle",
    action: "selectRabbit",
    validation: (state, ctx) => {
      const rabbit = state.rabbits.find(r => r.id === ctx?.selectedRabbitId);
      return rabbit && rabbit.sex === "F" && rabbit.stage !== "kit";
    },
    nextButtonText: "Mère sélectionnée ✓"
  },
  {
    id: "step-10",
    title: "Ajouter un sevrage",
    description: "Ajoute un sevrage (>=31 jours après la mise-bas)",
    action: "addEvent",
    params: { type: "sevrage", date: "2026-03-03", destCage: "C-01" },
    highlight: "#btnAddEvent",
    validation: (state, ctx) => {
      const rabbit = state.rabbits.find(r => r.id === ctx?.selectedRabbitId);
      return rabbit && state.events.some(e => e.rabbitId === rabbit.id && e.type === "sevrage");
    },
    nextButtonText: "Sevrage ajouté ✓"
  },
  {
    id: "step-11",
    title: "Lot créé automatiquement",
    description: "Le sevrage crée automatiquement un lot ! Va voir le lot en cliquant sur 'Lots' en haut",
    action: "openLots",
    highlight: "#tabLots",
    validation: (state) => state.events.some(e => e.type === "sevrage"),
    nextButtonText: "Lot visible ✓"
  },
  {
    id: "step-12",
    title: "Tester la vente",
    description: "Sélectionne un lapin et ajoute une vente avec prix. Son statut devient 'vendu'",
    action: "addEvent",
    params: { type: "vente", date: "2026-03-05", price: 25.50, client: "Jean" },
    highlight: "#btnAddEvent",
    validation: (state) => state.rabbits.some(r => r.status === "vendu"),
    nextButtonText: "Vente testée ✓"
  },
  {
    id: "step-13",
    title: "Tester le blocage",
    description: "Tente d'ajouter un événement sur un lapin vendu - c'est bloqué ! ✓",
    action: "testBlocking",
    highlight: "#rabbitDetails",
    validation: (_state, _ctx) => true,
    nextButtonText: "Compris ✓"
  },
  {
    id: "step-14",
    title: "Tutoriel terminé !",
    description: "Bravo ! Tu as testé toutes les fonctionnalités : saillie → mise-bas → sevrage → lot → vente 🎉",
    action: "complete",
    validation: () => true,
    nextButtonText: "Quitter le guide"
  }
];

export function getGuideStep(stepId) {
  return GUIDE_STEPS.find(s => s.id === stepId);
}

export function getGuideStepIndex(stepId) {
  return GUIDE_STEPS.findIndex(s => s.id === stepId);
}

export function getNextStep(stepId) {
  const idx = getGuideStepIndex(stepId);
  return idx < GUIDE_STEPS.length - 1 ? GUIDE_STEPS[idx + 1] : null;
}

export function getPrevStep(stepId) {
  const idx = getGuideStepIndex(stepId);
  return idx > 0 ? GUIDE_STEPS[idx - 1] : null;
}

export function initializeGuide(ctx) {
  ctx.guideMode = true;
  ctx.currentStep = GUIDE_STEPS[0].id;
  ctx.completedSteps = new Set();
  ctx.render();
}

export function exitGuide(ctx) {
  ctx.guideMode = false;
  ctx.currentStep = null;
  ctx.completedSteps.clear();
  ctx.render();
}

export function advanceGuide(ctx) {
  const step = getGuideStep(ctx.currentStep);
  if (!step) return;

  ctx.completedSteps.add(ctx.currentStep);
  const nextStep = getNextStep(ctx.currentStep);

  if (nextStep) {
    ctx.currentStep = nextStep.id;
  } else {
    exitGuide(ctx);
  }

  ctx.render();
}

export function goBackGuide(ctx) {
  const prevStep = getPrevStep(ctx.currentStep);
  if (prevStep) {
    ctx.currentStep = prevStep.id;
    ctx.render();
  }
}
