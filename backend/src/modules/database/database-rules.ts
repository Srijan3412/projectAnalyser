export const ORM_PACKAGES: Record<string, string> = {
  "@prisma/client": "Prisma",
  "mongoose": "Mongoose",
  "drizzle-orm": "Drizzle",
  "sequelize": "Sequelize",
  "typeorm": "TypeORM",
  "@supabase/supabase-js": "Supabase",
  "firebase": "Firebase",
  "firebase-admin": "Firebase",
};

export const DB_PACKAGES: Record<string, string> = {
  "pg": "PostgreSQL",
  "pg-promise": "PostgreSQL",
  "mysql2": "MySQL",
  "mysql": "MySQL",
  "sqlite3": "SQLite",
  "better-sqlite3": "SQLite",
  "mongodb": "MongoDB",
  "ioredis": "Redis",
  "redis": "Redis",
};

export const CONNECTION_TRIGGERS = [
  { trigger: "new PrismaClient", orm: "Prisma", db: "PostgreSQL" },
  { trigger: "mongoose.connect", orm: "Mongoose", db: "MongoDB" },
  { trigger: "mongoose.createConnection", orm: "Mongoose", db: "MongoDB" },
  { trigger: "createClient", orm: "Supabase", db: "PostgreSQL" },
  { trigger: "initializeApp", orm: "Firebase", db: "Firestore" },
  { trigger: "getFirestore", orm: "Firebase", db: "Firestore" },
  { trigger: "drizzle", orm: "Drizzle", db: "PostgreSQL" },
  { trigger: "new Sequelize", orm: "Sequelize", db: "MySQL" },
  { trigger: "new DataSource", orm: "TypeORM", db: "PostgreSQL" },
  { trigger: "createConnection", orm: "TypeORM", db: "PostgreSQL" },
];
