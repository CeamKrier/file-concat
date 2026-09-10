import { OutputSection } from "./output-section";
import { DocumentsSection } from "./documents-section";
import { FilteringSection } from "./filtering-section";
import { ComparisonSection } from "./comparison-section";
import { PrivacySection } from "./privacy-section";
import { SourcesSection } from "./sources-section";
import { CtaSection } from "./cta-section";
import { ResearchSection } from "./research-section";

export { SiteFooter } from "./site-footer";
export { MockWindow } from "./mock-window";
export { FurtherReading, ProseLink } from "./further-reading";

/**
 * The marketing stack below the hero, landing view only. The order is the
 * argument: what you get, what it reads, what it leaves out, how it compares,
 * why you can trust it, where the files come from, then the close and the
 * research that backs the page.
 */
export function MarketingSections() {
  return (
    <>
      <OutputSection />
      <DocumentsSection />
      <FilteringSection />
      <ComparisonSection />
      <PrivacySection />
      <SourcesSection />
      <CtaSection />
      <ResearchSection />
    </>
  );
}
