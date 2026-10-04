import { SCENARIOS } from "./benchmark";
import type { Context } from "./types";

export type DemoScenario = {
  id: string;
  label: string;
  context: Omit<Context, "date">;
  transcript: string;
  hint: string;
};

const presentation: Record<string, { label: string; hint: string; needsFollowUp?: boolean }> = {
  "tomato-transport": { label: "Transport bruising", hint: "17 kg composted from 120 kg gives a 14.2% loss estimate." },
  "banana-storage": { label: "Missing starting mass", hint: "During review, supply a starting mass of 200 kg and choose Estimated. The loss estimate is 12.5%.", needsFollowUp: true },
  "taro-handling": { label: "Rejected, then donated", hint: "The 10 kg were donated, so the qualifying loss estimate is 0%." },
  "banana-crates": { label: "Crate conversion", hint: "During review, enter 25 kg per crate for each crate quantity and choose Estimated. The loss estimate is 12.5%.", needsFollowUp: true },
  "tomato-correction": { label: "Spoken correction", hint: "The corrected affected mass is 7 kg, giving a 7.0% loss estimate." },
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  ...SCENARIOS.map((scenario) => ({
    id: scenario.id,
    label: presentation[scenario.id].label,
    context: scenario.context,
    transcript: presentation[scenario.id].needsFollowUp ? scenario.prompt : `${scenario.prompt} ${scenario.clarification}`,
    hint: presentation[scenario.id].hint,
  })),
  {
    id: "tomato-split-destinations",
    label: "Split destinations",
    context: { country: "FJ", commodity: "tomatoes", stage: "transport", location: "Suva" },
    transcript: "Started with 120 kg of tomatoes. After transport, 17 kg were rejected because of bruising. We composted 10 kg and donated the other 7 kg to the community. All quantities were weighed.",
    hint: "Only the 10 kg composted count toward loss: 10 kg out of 120 kg gives 8.3%.",
  },
];
