import type he from "@kj/i18n/messages/he.json";

declare module "next-intl" {
  interface AppConfig {
    Messages: typeof he;
  }
}
