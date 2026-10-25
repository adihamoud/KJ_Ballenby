import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BrandMark } from "@/components/guest/Brand";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4">
      <section className="card flex w-full flex-col items-center gap-4 p-8 text-center">
        <BrandMark size={56} />
        <h1 className="text-2xl font-black tracking-tight">{t("title")}</h1>
        <p className="text-muted">{t("body")}</p>
        <Link href="/" className="btn btn-primary w-full">
          {t("home")}
        </Link>
      </section>
    </main>
  );
}
