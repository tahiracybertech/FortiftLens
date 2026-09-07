import { Shield, Target, Users, Zap, Award, Globe, GraduationCap, Code2, Lock } from 'lucide-react';
import { Card } from '../components/ui/card';
import { motion } from 'motion/react';
import { PAGE_FADE } from '../../lib/motionPresets';
import { Reveal, StaggerParent, StaggerChild, GradientWord } from '../components/Reveal';

export default function About() {
  const team = [
    {
      name: 'Tayyaba Abbasi',
      role: 'Lead Developer & Security Architect',
      expertise: 'Full-Stack Development · AI Integration · SDLC Security',
      initials: 'TA',
      gradient: 'from-[#00D4FF] to-[#0066FF]',
    },
    {
      name: 'Mehwish Bibi',
      role: 'Backend Engineer & AI Specialist',
      expertise: 'Node.js · Firebase · Threat Modeling',
      initials: 'M',
      gradient: 'from-[#7B61FF] to-[#00D4FF]',
    },
    {
      name: 'Tahira Waseem',
      role: 'Frontend Developer & UX Designer',
      expertise: 'React · TypeScript · Security UX',
      initials: 'T',
      gradient: 'from-[#00FF88] to-[#00D4FF]',
    },
  ];

  const values = [
    {
      icon: Shield,
      title: 'Security First',
      description: 'We believe security should never be an afterthought. Our platform integrates protection from the very first requirement.'
    },
    {
      icon: Zap,
      title: 'Innovation',
      description: 'Leveraging cutting-edge AI to revolutionize how enterprises approach secure software development.'
    },
    {
      icon: Users,
      title: 'Collaboration',
      description: 'Built as a Final Year Project at a top Pakistani university, combining academic research with real-world security needs.'
    },
    {
      icon: Award,
      title: 'Excellence',
      description: 'Committed to the highest standards in security automation, threat detection, and compliance.'
    }
  ];

  return (
    <motion.div {...PAGE_FADE} className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#0A0E1A] to-[#0F1629]">
      {/* Hero */}
      <section className="relative overflow-hidden py-20">
        {/* one decorative dot field in the corner — never interactive */}
        <div className="dot-wave pointer-events-none absolute -top-16 -right-20 h-[28rem] w-[28rem] opacity-[0.16]" />
        <div className="container relative z-10 mx-auto px-4">
          <Reveal className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#00D4FF]/10 border border-[#00D4FF]/30 mb-6">
              <Globe className="w-4 h-4 text-[#00D4FF]" />
              <span className="text-sm text-[#00D4FF]">About FortifyLens</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
              Building the Future of{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00D4FF] to-[#00D4D4]">
                Secure Development
              </span>
            </h1>
            <p className="text-xl text-gray-300">
              An AI-powered Secure SDLC platform built as a Final Year Project — eliminating security vulnerabilities
              before they're coded, empowering enterprises to build secure software from day one.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Vision & Mission */}
      <section className="py-20 bg-white/5">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
              <Card className="hover-lift p-8 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 h-full">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#00D4FF] to-[#0A0E1A] flex items-center justify-center mb-6">
                  <Target className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-4">Our Vision</h2>
                <p className="text-gray-300 leading-relaxed">
                  To become the global standard for secure software development lifecycle management,
                  where every enterprise application is built with security intelligence from conception to deployment.
                </p>
              </Card>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
              <Card className="hover-lift p-8 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 h-full">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#00D4FF] to-[#0A0E1A] flex items-center justify-center mb-6">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-4">Our <GradientWord>Mission</GradientWord></h2>
                <p className="text-gray-300 leading-relaxed">
                  Empower development teams with AI-powered security insights during requirements and design phases,
                  preventing vulnerabilities before they enter production and reducing security costs significantly.
                </p>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Problem Statement */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <Reveal>
              <h2 className="text-4xl font-bold text-white mb-6 text-center">The Critical Problem</h2>
              <Card className="p-8 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 mb-8">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-semibold text-[#00D4FF] mb-3">Security is Too Late in Traditional SDLC</h3>
                    <p className="text-gray-300 leading-relaxed">
                      Most organizations only address security during testing or production, when fixing vulnerabilities
                      costs 30-100x more than catching them in requirements or design phases. This reactive approach
                      leads to costly breaches, delayed releases, and compliance failures.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-6">
                    {[
                      { value: '$4.5M', label: 'Average Data Breach Cost' },
                      { value: '100x', label: 'Cost to Fix in Production' },
                      { value: '60%', label: 'Bugs from Design Phase' },
                    ].map(stat => (
                      <div key={stat.label} className="text-center p-4 bg-[#00D4FF]/10 rounded-lg border border-[#00D4FF]/20">
                        <div className="text-3xl font-bold text-[#00D4FF] mb-2">{stat.value}</div>
                        <div className="text-sm text-gray-400">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold text-[#00D4FF] mb-3">The FortifyLens Solution</h3>
                    <ul className="space-y-2">
                      {[
                        'Identifies missing security requirements automatically using AI analysis',
                        'Performs STRIDE-based threat modeling on architecture designs',
                        'Validates compliance with ISO, OWASP, PCI-DSS, and HIPAA standards',
                        'Provides actionable mitigation strategies before code is written',
                        'Real-time vulnerability scanning of dependencies (SCA)',
                        'Cross-phase consistency analysis to catch gaps between SDLC phases',
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-gray-300">
                          <Shield className="w-5 h-5 text-[#00D4FF] mt-0.5 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section className="py-20 bg-white/5">
        <div className="container mx-auto px-4">
          <Reveal className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">Our Core Values</h2>
            <p className="text-gray-400 text-lg">The principles that guide everything we do</p>
          </Reveal>
          <StaggerParent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {values.map((value, index) => (
              <StaggerChild key={index} className="h-full">
                <Card className="hover-lift p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 h-full">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#00D4FF] to-[#0A0E1A] flex items-center justify-center mb-4">
                    <value.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">{value.title}</h3>
                  <p className="text-gray-400 text-sm">{value.description}</p>
                </Card>
              </StaggerChild>
            ))}
          </StaggerParent>
        </div>
      </section>

      {/* Leadership Team */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <Reveal className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#00D4FF]/10 border border-[#00D4FF]/30 mb-4">
              <GraduationCap className="w-4 h-4 text-[#00D4FF]" />
              <span className="text-sm text-[#00D4FF]">Final Year Project Team</span>
            </div>
            <h2 className="text-4xl font-bold text-white mb-4">Leadership Team</h2>
            <p className="text-gray-400 text-lg">The minds behind FortifyLens — passionate about security and AI</p>
          </Reveal>

          <StaggerParent className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {team.map((member, index) => (
              <StaggerChild key={index} className="h-full">
                <Card className="hover-lift p-8 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 text-center group h-full">
                  {/* Avatar with initials */}
                  <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${member.gradient} flex items-center justify-center mx-auto mb-5 shadow-lg group-hover:scale-105 transition-transform`}>
                    <span className="text-2xl font-bold text-white">{member.initials}</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">{member.name}</h3>
                  <div className="text-[#00D4FF] text-sm font-medium mb-3">{member.role}</div>
                  <div className="flex flex-wrap justify-center gap-1">
                    {member.expertise.split(' · ').map(skill => (
                      <span key={skill} className="text-xs px-2 py-1 rounded-full bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/20">
                        {skill}
                      </span>
                    ))}
                  </div>
                </Card>
              </StaggerChild>
            ))}
          </StaggerParent>

          {/* FYP badge */}
          <Reveal className="text-center mt-12">
            <Card className="p-6 bg-gradient-to-r from-[#00D4FF]/10 to-[#7B61FF]/10 border-[#00D4FF]/20 max-w-2xl mx-auto">
              <div className="flex items-center justify-center gap-3 mb-3">
                <GraduationCap className="w-6 h-6 text-[#00D4FF]" />
                <h3 className="text-white font-semibold text-lg">Final Year Project</h3>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">
                FortifyLens was developed as a Final Year Project, combining academic research in
                cybersecurity and artificial intelligence with practical enterprise security challenges.
                Our goal: make secure software development accessible to every organization.
              </p>
            </Card>
          </Reveal>
        </div>
      </section>
    </motion.div>
  );
}