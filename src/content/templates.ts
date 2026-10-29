import type { Settings } from "@/db/schema";

export const TEMPLATE_KINDS = ["referral", "recruiter", "hiring_manager"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  referral: "Referral",
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
};

/** Placeholders: {company} {title} {name} {portfolio} {availability} {stack} {reason}. */
export const TEMPLATES: Record<TemplateKind, string> = {
  referral:
    "Hi — I saw {company} is hiring a {title}. I'm {name}, a full-stack engineer ({stack}); I built the AI content-moderation pipeline for a live dating platform and {availability}. I'd like to join {company} because {reason}. Resume and projects: {portfolio}. Would you be open to referring me, or pointing me to the right person?",
  recruiter:
    "Hi — I'm interested in the {title} role at {company}. Quick facts: {stack}, 4+ years, currently at GeekyAnts, {availability}. Resume and projects: {portfolio}. Happy to do a quick call this week — is the process still open?",
  hiring_manager:
    "Hi — I came across the {title} opening on your team at {company}. I'm {name}, a full-stack engineer ({stack}) who shipped an AI moderation pipeline and a NestJS migration of 100+ modules in production, and {availability}. I'd value 15 minutes to hear what the team is building: {portfolio}.",
};

export const REASON_PLACEHOLDER = "[why this company]";

export type TemplateProfile = Pick<Settings, "myName" | "myPortfolioUrl" | "myAvailabilityLine" | "myStackLine">;

export function fillTemplate(
  kind: TemplateKind,
  job: { company: string; title: string },
  profile: TemplateProfile,
): string {
  const values: Record<string, string> = {
    company: job.company,
    title: job.title,
    name: profile.myName,
    portfolio: profile.myPortfolioUrl,
    availability: profile.myAvailabilityLine,
    stack: profile.myStackLine,
    reason: REASON_PLACEHOLDER,
  };
  return TEMPLATES[kind].replace(/\{(\w+)\}/g, (m, key: string) => values[key] ?? m);
}

export function fillAllTemplates(job: { company: string; title: string }, profile: TemplateProfile) {
  return TEMPLATE_KINDS.map((kind) => ({ kind, label: TEMPLATE_LABELS[kind], text: fillTemplate(kind, job, profile) }));
}
