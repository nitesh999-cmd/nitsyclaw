import { MapPin } from "./icons";
import { SITE } from "@/lib/site";

export default function About() {
  return (
    <section id="about" className="bg-ink py-20 text-white sm:py-24">
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <span className="eyebrow border-white/15 bg-white/10 text-slate-200">
              About Nitesh
            </span>
            <div className="mt-6 flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-xl font-bold text-ink">
                NB
              </span>
              <div>
                <p className="text-lg font-bold text-white">{SITE.name}</p>
                <p className="text-sm text-slate-300">{SITE.role}</p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-400">
                  <MapPin className="h-3.5 w-3.5" />
                  {SITE.location}
                </p>
              </div>
            </div>
            <p className="mt-6 text-sm leading-relaxed text-slate-400">
              LinkedIn positioning: Acquisitions Manager · Commercial Energy ·
              Lighting · Solar · Battery.
            </p>
          </div>

          <div className="space-y-5 text-lg leading-relaxed text-slate-300">
            <p>
              I am not a theory consultant. My background comes from real
              selling, real customers, real proposals, real follow-up, and real
              operational pressure.
            </p>
            <p>
              I have worked across commercial energy, solar, lighting, business
              development, and compliance-heavy environments where execution
              matters. I understand what happens when leads are not chased,
              customers are not handled properly, teams are unclear, and owners
              are forced to hold the whole business together.
            </p>
            <p className="border-l-2 border-accent-strong pl-5 text-xl font-semibold text-white">
              My job is to find the leak, simplify the process, and help build a
              system your team can actually use.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
