import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------- enums ----------

export const atsEnum = pgEnum("ats", ["greenhouse", "lever", "ashby"]);

export const fetchStatusEnum = pgEnum("fetch_status", ["ok", "error"]);

export const locationMatchEnum = pgEnum("location_match", [
  "explicit",
  "remote",
  "unknown",
  "none",
]);

export const ignoreReasonEnum = pgEnum("ignore_reason", ["title", "location", "age", "manual"]);

export const messageKindEnum = pgEnum("message_kind", ["alert", "digest", "reply", "held"]);

export const jobStatusEnum = pgEnum("job_status", [
  "new",
  "ignored",
  "applied",
  "referral_asked",
  "replied",
  "interviewing",
  "rejected",
  "offer",
]);

const tz = { withTimezone: true } as const;

// ---------- companies ----------

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    ats: atsEnum("ats").notNull(),
    slug: text("slug").notNull(),
    careersUrl: text("careers_url"),
    priority: integer("priority").notNull().default(2),
    active: boolean("active").notNull().default(true),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastFetchedAt: timestamp("last_fetched_at", tz),
    lastFetchStatus: fetchStatusEnum("last_fetch_status"),
    lastFetchError: text("last_fetch_error"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("companies_ats_slug_uq").on(t.ats, t.slug),
    check("companies_priority_range", sql`${t.priority} between 1 and 3`),
  ],
);

// ---------- jobs ----------

export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    source: atsEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    isRemote: boolean("is_remote").notNull().default(false),
    url: text("url").notNull(),
    applyUrl: text("apply_url").notNull(),
    postedAt: timestamp("posted_at", tz),
    firstSeenAt: timestamp("first_seen_at", tz).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", tz).notNull().defaultNow(),
    isOpen: boolean("is_open").notNull().default(true),
    descriptionText: text("description_text"),
    matchScore: integer("match_score").notNull().default(0),
    matchedKeywords: text("matched_keywords")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    locationMatch: locationMatchEnum("location_match").notNull().default("none"),
    status: jobStatusEnum("status").notNull().default("new"),
    ignoreReason: ignoreReasonEnum("ignore_reason"),
    statusChangedAt: timestamp("status_changed_at", tz).notNull().defaultNow(),
    appliedAt: timestamp("applied_at", tz),
    referrerName: text("referrer_name"),
    notes: text("notes"),
    nextAction: text("next_action"),
    nextActionDate: date("next_action_date"),
    notifiedAt: timestamp("notified_at", tz),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("jobs_source_external_id_uq").on(t.source, t.externalId),
    index("jobs_status_idx").on(t.status),
    index("jobs_posted_at_idx").on(t.postedAt),
    index("jobs_next_action_date_idx").on(t.nextActionDate),
    index("jobs_company_id_idx").on(t.companyId),
  ],
);

// ---------- settings (single row, id = 1) ----------

export const settings = pgTable("settings", {
  id: integer("id").primaryKey(),
  titleInclude: text("title_include").array().notNull().default(sql`'{}'::text[]`),
  titleExclude: text("title_exclude").array().notNull().default(sql`'{}'::text[]`),
  descriptionBoost: text("description_boost")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  locations: text("locations").array().notNull().default(sql`'{}'::text[]`),
  includeRemote: boolean("include_remote").notNull().default(true),
  includeUnknownLocation: boolean("include_unknown_location").notNull().default(true),
  maxAgeDays: integer("max_age_days").notNull().default(3),
  minNotifyScore: integer("min_notify_score").notNull().default(2),
  telegramChatId: text("telegram_chat_id"),
  quietStart: time("quiet_start").notNull().default("22:00"),
  quietEnd: time("quiet_end").notNull().default("08:00"),
  digestTime: time("digest_time").notNull().default("08:30"),
  myName: text("my_name").notNull().default(""),
  myPortfolioUrl: text("my_portfolio_url").notNull().default(""),
  myAvailabilityLine: text("my_availability_line").notNull().default(""),
  myStackLine: text("my_stack_line").notNull().default(""),
});

// ---------- tick_runs ----------

export const tickRuns = pgTable("tick_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", tz).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", tz),
  companiesFetched: integer("companies_fetched").notNull().default(0),
  jobsNew: integer("jobs_new").notNull().default(0),
  jobsNotified: integer("jobs_notified").notNull().default(0),
  errors: text("errors"),
});

// ---------- messages_sent (Telegram: daily cap, digest-sent-today, quiet-hours hold) ----------

export const messagesSent = pgTable(
  "messages_sent",
  {
    id: serial("id").primaryKey(),
    sentAt: timestamp("sent_at", tz).notNull().defaultNow(),
    kind: messageKindEnum("kind").notNull(),
    jobId: integer("job_id").references(() => jobs.id, { onDelete: "set null" }),
    chatId: text("chat_id").notNull(),
  },
  (t) => [index("messages_sent_sent_at_idx").on(t.sentAt), index("messages_sent_job_id_idx").on(t.jobId)],
);

// ---------- inferred types ----------

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type TickRun = typeof tickRuns.$inferSelect;
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export type Ats = (typeof atsEnum.enumValues)[number];
export type LocationMatch = (typeof locationMatchEnum.enumValues)[number];
export type IgnoreReason = (typeof ignoreReasonEnum.enumValues)[number];
export type MessageSent = typeof messagesSent.$inferSelect;
export type MessageKind = (typeof messageKindEnum.enumValues)[number];
