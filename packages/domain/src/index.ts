export type LeadInterest =
  | "farm_or_grower"
  | "agricultural_business"
  | "research_institution"
  | "robotics_collaborator"
  | "investor_or_partner"
  | "technical_contributor"
  | "other";

export type LeadSource = "cropautonomy.com" | "gaiabots.ai";

export interface PublicLead {
  name: string;
  email: string;
  organization?: string;
  interest: LeadInterest;
  message?: string;
  consent: boolean;
  source: LeadSource;
}
