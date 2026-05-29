import Header from "@/components/Header";
import Hero from "@/components/Hero";
import CredibilityStrip from "@/components/CredibilityStrip";
import Leakage from "@/components/Leakage";
import BigPromise from "@/components/BigPromise";
import WhatIFix from "@/components/WhatIFix";
import Offers from "@/components/Offers";
import Method from "@/components/Method";
import WhoIHelp from "@/components/WhoIHelp";
import About from "@/components/About";
import WhyThisMatters from "@/components/WhyThisMatters";
import FinalCta from "@/components/FinalCta";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main id="main">
        <Hero />
        <CredibilityStrip />
        <Leakage />
        <BigPromise />
        <WhatIFix />
        <Offers />
        <Method />
        <WhoIHelp />
        <About />
        <WhyThisMatters />
        <FinalCta />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
