import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const businessState = sqliteTable('business_state', {
  id: text('id').primaryKey(),
  body: text('body').notNull(),
  revision: integer('revision').notNull(),
});
export const modelConfigs = sqliteTable('model_configs', {
  kind: text('kind').primaryKey(),
  body: text('body').notNull(),
  secret: text('secret').notNull(),
});
export const modelProfiles = sqliteTable('model_profiles', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  body: text('body').notNull(),
  secret: text('secret').notNull(),
});
export const modelSelections = sqliteTable('model_defaults', {
  kind: text('kind').primaryKey(),
  profileId: text('profile_id').notNull(),
});
export const generationJobs = sqliteTable(
  'generation_jobs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull(),
    remoteId: text('remote_id'),
    config: text('config').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('idx_generation_jobs_project_created').on(t.projectId, t.createdAt),
  ],
);
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  revision: integer('revision').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  size: integer('size').notNull(),
});
