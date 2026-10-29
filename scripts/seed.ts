/**
 * Idempotent seed: ensures the single settings row (id = 1) exists with the
 * defaults from CLAUDE.md. Re-running never overwrites edits made in the app.
 * Run with: pnpm seed   (loads .env.local via node --env-file)
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { settings } from "../src/db/schema";

const defaults: typeof settings.$inferInsert = {
  id: 1,
  titleInclude: [
    "full stack", "fullstack", "full-stack", "backend", "back-end",
    "software engineer", "software developer", "sde", "node", "nodejs",
    "node.js", "nestjs", "next.js", "nextjs", "react", "typescript",
    "javascript", "web developer", "frontend", "front-end", "product engineer",
    "member of technical staff", "mts",
  ],
  titleExclude: [
    "intern", "internship", "manager", "director", "principal", "staff",
    "architect", "vp", "head of", "react native", "android", "ios", "flutter",
    "qa", "test", "sdet", "devops", "sre", "data", "ml", "machine learning",
    "ai engineer", "php", ".net", "c#", "golang", "go engineer", "python",
    "java engineer", "ruby", "rails", "salesforce", "sap", "new grad", "graduate",
    "fresher", "trainee", "entry level", "junior", "associate",
  ],
  descriptionBoost: [
    "nestjs", "next.js", "postgresql", "postgres", "prisma", "drizzle",
    "redis", "bullmq", "aws", "docker", "graphql", "openai",
  ],
  locations: ["bengaluru", "bangalore", "india"],
  includeRemote: true,
  includeUnknownLocation: true,
  maxAgeDays: 7,
  minNotifyScore: 2,
  quietStart: "22:00",
  quietEnd: "08:00",
  digestTime: "08:30",
  myName: "Neeraj",
  myPortfolioUrl: "https://neerajnero.com",
  myAvailabilityLine: "can join within 3 weeks (offer in hand)",
  myStackLine: "React, Next.js, Node.js, NestJS, TypeScript, PostgreSQL",
};

async function main() {
  const existing = await db.select({ id: settings.id }).from(settings).where(eq(settings.id, 1));
  if (existing.length > 0) {
    console.log("seed: settings row already present, nothing to do");
    return;
  }
  await db.insert(settings).values(defaults).onConflictDoNothing();
  console.log("seed: inserted settings row id=1");
}

main().catch((err) => {
  console.error("seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
