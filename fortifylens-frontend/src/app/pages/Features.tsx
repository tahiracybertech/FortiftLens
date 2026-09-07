import { Shield, Lock, Brain, CheckCircle2, FileText, Layout, BarChart3, Users, Download, Zap, Target, AlertTriangle } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { motion } from 'motion/react';
import { PAGE_FADE } from '../../lib/motionPresets';
import { Link } from 'react-router';
import { Reveal, StaggerParent, StaggerChild, GradientWord } from '../components/Reveal';

export default function Features() {
  const mainFeatures = [
    {
      icon: FileText,
      title: 'AI-Powered Requirement Analysis',
      description: 'Intelligent security requirement validation with automated compliance mapping',
      features: [
        'Security requirement validation',
        'Automated risk scoring engine',
        'Compliance mapping (ISO 27001, OWASP, PCI-DSS, HIPAA)',
        'Missing requirement detection',
        'Security checklist generation'
      ],
      color: 'from-[#00D4FF] to-[#00D4D4]'
    },
    {
      icon: Layout,
      title: 'Secure Design & Threat Modeling',
      description: 'STRIDE-based threat detection with comprehensive architecture analysis',
      features: [
        'STRIDE-based threat detection',
        'Architecture validation and analysis',
        'Component classification (API, Database, Client, Server)',
        'Automated threat identification',
        'Mitigation strategy recommendations'
      ],
      color: 'from-[#00D4FF] to-[#0A0E1A]'
    },
    {
      icon: CheckCircle2,
      title: 'Early Security Validation',
      description: 'Pre-development security checks with intelligent control recommendations',
      features: [
        'Pre-development security validation',
        'Design weakness detection',
        'Control recommendation engine',
        'Risk visualization dashboards',
        'Readiness assessment scoring'
      ],
      color: 'from-[#00D4D4] to-[#00D4FF]'
    }
  ];

  const additionalFeatures = [
    {
      icon: Users,
      title: 'Role-Based Access Control',
      description: 'Granular permissions for admins and security analysts with team collaboration tools'
    },
    {
      icon: Brain,
      title: 'AI Risk Intelligence Engine',
      description: 'Machine learning-powered threat detection trained on thousands of security vulnerabilities'
    },
    {
      icon: Download,
      title: 'Automated Security Reporting',
      description: 'Generate comprehensive PDF reports with risk scores, threat analysis, and compliance documentation'
    },
    {
      icon: BarChart3,
      title: 'Real-Time Analytics',
      description: 'Interactive dashboards with risk trends, project distribution, and security metrics'
    },
    {
      icon: Shield,
      title: 'Compliance Frameworks',
      description: 'Built-in support for ISO 27001, OWASP Top 10, PCI-DSS, HIPAA, GDPR, and custom frameworks'
    },
    {
      icon: Zap,
      title: 'Automated Workflows',
      description: 'Streamlined SDLC phases with gated progression and automated validation checks'
    }
  ];

  const benefits = [
    {
      stat: '90%',
      label: 'Cost Reduction',
      description: 'Save costs by catching vulnerabilities in early phases'
    },
    {
      stat: '100x',
      label: 'Cheaper Fixes',
      description: 'Fixing in requirements vs production phase'
    },
    {
      stat: '60%',
      label: 'Faster Delivery',
      description: 'Reduce security-related delays in development'
    },
    {
      stat: '24/7',
      label: 'AI Monitoring',
      description: 'Continuous threat intelligence and analysis'
    }
  ];

  return (
    <motion.div {...PAGE_FADE} className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#0A0E1A] to-[#0F1629] py-20">
      <div className="container relative mx-auto px-4">
        {/* single decorative dot field for this page — never interactive */}
        <div className="dot-wave pointer-events-none absolute -top-28 -right-24 h-[26rem] w-[26rem] opacity-[0.16]" />

        {/* Header */}
        <Reveal className="relative z-10 text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#00D4FF]/10 border border-[#00D4FF]/30 mb-6">
            <Zap className="w-4 h-4 text-[#00D4FF]" />
            <span className="text-sm text-[#00D4FF]">Product Features</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
            Enterprise Security{' '}
            <GradientWord>Built-In</GradientWord>
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-8">
            Comprehensive AI-powered security platform covering every phase of your SDLC
          </p>

          <Button
            asChild
            size="lg"
            className="bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 hover:from-[#00D4FF]/90 hover:to-[#00D4FF]/70 text-white border-0"
          >
            <Link to="/login">
              Access Dashboard → Login
            </Link>
          </Button>
        </Reveal>

        {/* Main Features */}
        <div className="relative z-10 space-y-16 mb-20">
          {mainFeatures.map((feature, index) => (
            <Reveal key={index} delay={index * 0.08}>
              <Card className="p-8 md:p-12 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 overflow-hidden relative">
                <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${feature.color} opacity-10 blur-3xl`} />
                
                <div className="relative z-10">
                  <div className="flex flex-col md:flex-row gap-8 items-start">
                    <div className="flex-shrink-0">
                      <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center`}>
                        <feature.icon className="w-10 h-10 text-white" />
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <Badge className="mb-4 bg-[#00D4FF]/20 text-[#00D4FF] border-[#00D4FF]/30">
                        Phase {index + 1}
                      </Badge>
                      <h2 className="text-3xl font-bold text-white mb-3">{feature.title}</h2>
                      <p className="text-gray-300 text-lg mb-6">{feature.description}</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {feature.features.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <CheckCircle2 className="w-5 h-5 text-[#00D4FF] flex-shrink-0 mt-0.5" />
                            <span className="text-gray-300">{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>

        {/* Additional Features Grid */}
        <Reveal className="relative z-10 mb-20">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              Additional <GradientWord>Capabilities</GradientWord>
            </h2>
            <p className="text-gray-400 text-lg">Everything you need for comprehensive SDLC security</p>
          </div>

          <StaggerParent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {additionalFeatures.map((feature, index) => (
              <StaggerChild key={index} className="h-full">
                <Card className="hover-lift p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 h-full">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#00D4FF] to-[#0A0E1A] flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                  <p className="text-gray-400">{feature.description}</p>
                </Card>
              </StaggerChild>
            ))}
          </StaggerParent>
        </Reveal>

        
        {/* Benefits */}
        <Reveal className="relative z-10 mb-20">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">Measurable Impact</h2>
            <p className="text-gray-400 text-lg">Real results from shifting security left</p>
          </div>

          <StaggerParent className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {benefits.map((benefit, index) => (
              <StaggerChild key={index} className="h-full">
                <Card className="hover-lift p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 text-center h-full">
                  <div className="text-5xl font-bold text-[#00D4FF] mb-2">{benefit.stat}</div>
                  <div className="text-white font-semibold mb-2">{benefit.label}</div>
                  <div className="text-sm text-gray-400">{benefit.description}</div>
                </Card>
              </StaggerChild>
            ))}
          </StaggerParent>
        </Reveal>

        {/* CTA Section */}
        <Reveal className="relative z-10">
          <Card className="p-12 bg-gradient-to-br from-[#00D4FF]/10 to-[#0A0E1A]/10 border-[#00D4FF]/30 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to Secure Your SDLC?
            </h2>
            <p className="text-gray-300 text-lg mb-8 max-w-2xl mx-auto">
              Get started with FortifyLens today and transform your security workflow
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                asChild
                size="lg"
                className="bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 hover:from-[#00D4FF]/90 hover:to-[#00D4FF]/70 text-white border-0 text-lg px-8"
              >
                <Link to="/login">
                  Access Dashboard
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-[#00D4FF]/50 text-[#00D4FF] hover:bg-[#00D4FF]/10 text-lg px-8"
              >
                <Link to="/contact">
                  Schedule Demo
                </Link>
              </Button>
            </div>
          </Card>
        </Reveal>
      </div>
    </motion.div>
  );
}
