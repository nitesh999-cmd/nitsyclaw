import Header from "@/components/Header";
import ScrollProgress from "@/components/ScrollProgress";
import Hero from "@/components/Hero";
import CredibilityStrip from "@/components/CredibilityStrip";
import Leakage from "@/components/Leakage";
import LeakScorecard from "@/components/LeakScorecard";
import BigPromise from "@/components/BigPromise";
import WhatIFix from "@/components/WhatIFix";
import Comparison from "@/components/Comparison";
import Offers from "@/components/Offers";
import Method from "@/components/Method";
import WhoIHelp from "@/components/WhoIHelp";
import About from "@/components/About";
import WhyThisMatters from "@/components/WhyThisMatters";
import Faq from "@/components/Faq";
import FinalCta from "@/components/FinalCta";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import StickyCtaBar from "@/components/StickyCtaBar";

export default function Home() {
  return (
    <>
      <ScrollProgress />
      <Header />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />
        <CredibilityStrip />
        <Leakage />
        <LeakScorecard />
        <BigPromise />
        <WhatIFix />
        <Comparison />
        <Offers />
        <Method />
        <WhoIHelp />
        <About />
        <WhyThisMatters />
        <Faq />
        <FinalCta />
        <Contact />
      </main>
      <Footer />
      {/* spacer so the mobile sticky bar never covers footer content */}
      <div className="h-20 md:hidden" aria-hidden="true" />
      <StickyCtaBar />
    </>
  );
}
