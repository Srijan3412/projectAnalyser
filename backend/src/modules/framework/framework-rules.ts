import { FrameworkRule } from "./types.js";

export const FRAMEWORK_RULES: FrameworkRule[] = [
  {
    name: "Next.js",
    dependencies: ["next"],
    fileCues: ["next.config.js", "next.config.mjs", "next.config.ts"],
  },
  {
    name: "NestJS",
    dependencies: ["@nestjs/core", "@nestjs/common"],
    codeCues: ["@Module(", "@Controller(", "@Injectable("],
  },
  {
    name: "Express",
    dependencies: ["express"],
    codeCues: ["express()", "require('express')", 'require("express")', "import express"],
  },
  {
    name: "Fastify",
    dependencies: ["fastify"],
    codeCues: ["fastify()", "require('fastify')", 'require("fastify")', "import fastify"],
  },
  {
    name: "Hono",
    dependencies: ["hono"],
    codeCues: ["new Hono(", "import { Hono }"],
  },
  {
    name: "Koa",
    dependencies: ["koa"],
    codeCues: ["new Koa(", "require('koa')", 'require("koa")', "import Koa"],
  },
  {
    name: "Nuxt",
    dependencies: ["nuxt"],
    fileCues: ["nuxt.config.js", "nuxt.config.ts"],
  },
  {
    name: "Gatsby",
    dependencies: ["gatsby"],
    fileCues: ["gatsby-config.js", "gatsby-config.ts"],
  },
  {
    name: "React",
    dependencies: ["react", "react-dom"],
  },
  {
    name: "Vue",
    dependencies: ["vue"],
  },
  {
    name: "Svelte",
    dependencies: ["svelte"],
  },
  {
    name: "Angular",
    dependencies: ["@angular/core"],
  }
];
