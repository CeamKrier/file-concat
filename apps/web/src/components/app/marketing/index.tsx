import { OutputSection } from "./output-section";
import { FilteringSection } from "./filtering-section";
import { PrivacySection } from "./privacy-section";
import { CliSection } from "./cli-section";
import { CtaSection } from "./cta-section";

export { SiteFooter } from "./site-footer";

/** The marketing stack below the hero (sections A–E), landing view only. */
export function MarketingSections() {
  return (
    <>
      <OutputSection />
      <FilteringSection />
      <PrivacySection />
      <CliSection />
      <CtaSection />
    </>
  );
}
