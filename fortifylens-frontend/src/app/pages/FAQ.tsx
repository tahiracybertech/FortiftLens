import { HelpCircle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Card } from '../components/ui/card';
import { motion } from 'motion/react';
import { PAGE_FADE } from '../../lib/motionPresets';
import { Reveal } from '../components/Reveal';

export default function FAQ() {
  const faqs = [
    {
      category: 'General',
      questions: [
        {
          question: 'What is FortifyLens?',
          answer: 'FortifyLens is an enterprise-grade Secure SDLC platform that integrates AI-powered security analysis into the earliest phases of software development. It helps identify security requirements, perform threat modeling, and validate designs before development begins.'
        },
        {
          question: 'How does FortifyLens differ from traditional security tools?',
          answer: 'Unlike traditional tools that focus on testing and production environments, FortifyLens shifts security left by integrating threat detection and risk analysis during requirements and design phases. This proactive approach can reduce security costs by up to 90% compared to fixing vulnerabilities in production.'
        },
        {
          question: 'Which industries can benefit from FortifyLens?',
          answer: 'FortifyLens is designed for any industry handling sensitive data or requiring regulatory compliance, including finance, healthcare, e-commerce, government, and technology sectors. Our platform supports ISO 27001, OWASP, PCI-DSS, HIPAA, and custom compliance frameworks.'
        }
      ]
    },
    {
      category: 'AI & Security',
      questions: [
        {
          question: 'How does the AI-powered analysis work?',
          answer: 'Our AI engine analyzes your project requirements, architecture designs, and component relationships using machine learning models trained on thousands of security vulnerabilities and threat patterns. It automatically identifies missing security requirements, performs STRIDE-based threat modeling, and suggests mitigation strategies based on industry best practices.'
        },
        {
          question: 'What is STRIDE threat modeling?',
          answer: 'STRIDE is a threat modeling framework that categorizes security threats into six types: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, and Elevation of Privilege. FortifyLens automatically applies STRIDE analysis to your architecture diagrams and identifies potential threats in each category.'
        },
        {
          question: 'Is my data secure on FortifyLens?',
          answer: 'Absolutely. We employ enterprise-grade encryption (AES-256), secure data transmission (TLS 1.3), role-based access control, and comprehensive audit logging. All data is encrypted at rest and in transit. We are SOC 2 Type II certified and undergo regular third-party security audits.'
        },
        {
          question: 'Can the AI be customized for our specific needs?',
          answer: 'Yes, Enterprise plan customers can train custom AI models based on their organization\'s specific security policies, threat landscape, and compliance requirements. We work with your security team to fine-tune the AI for maximum relevance to your environment.'
        }
      ]
    },
    {
      category: 'Features & Functionality',
      questions: [
        {
          question: 'What are the three main phases of FortifyLens?',
          answer: 'Phase 1: Requirement Analysis - AI detects missing security requirements and provides compliance checking. Phase 2: Secure Design & Threat Modeling - STRIDE-based threat detection with architecture analysis. Phase 3: Early Security Validation - Pre-development validation with design weakness detection and control recommendations.'
        },
        {
          question: 'Can I upload custom architecture diagrams?',
          answer: 'Yes, you can upload architecture diagrams in various formats (PNG, JPG, PDF, or draw directly in the platform). Our AI automatically identifies components, classifies them (API, Database, Client, Server), and performs comprehensive threat analysis based on the relationships between components.'
        },
        {
          question: 'What compliance frameworks do you support?',
          answer: 'We support ISO 27001, OWASP Top 10, PCI-DSS, HIPAA, GDPR, SOC 2, NIST, and CCPA out of the box. Enterprise customers can define custom compliance frameworks and rules specific to their industry or organizational requirements.'
        },
        {
          question: 'Can I generate reports for stakeholders?',
          answer: 'Yes, FortifyLens generates comprehensive PDF reports including risk scores, threat analysis, missing requirements, security checklists, and mitigation recommendations. Reports can be customized by role and exported for board presentations, audit trails, or compliance documentation.'
        }
      ]
    },
    {
      category: 'Pricing & Plans',
      questions: [
        {
          question: 'What is included in the free trial?',
          answer: 'The free trial includes access to all Starter plan features for 14 days, including up to 5 projects, basic requirement analysis, STRIDE threat modeling, and email support. No credit card required to start.'
        },
        {
          question: 'Can I change my plan later?',
          answer: 'Yes, you can upgrade or downgrade your plan at any time. Upgrades take effect immediately, while downgrades will be applied at the end of your current billing cycle. All your data and projects remain intact when changing plans.'
        },
        {
          question: 'Do you offer annual billing discounts?',
          answer: 'Currently, FortifyLens offers monthly billing only, so there are no annual billing discounts. All plans are billed on a month-to-month basis, and you can upgrade or downgrade your plan at any time.'
        },
        {
          question: 'What payment methods do you accept?',
          answer: 'We accept all major credit cards (Visa, MasterCard, American Express) and ACH transfers. Wire transfers and invoicing are available for Business plan customers.'
        }
      ]
    },
    {
      category: 'Integration & Support',
      questions: [
        {
          question: 'Does FortifyLens integrate with existing tools?',
          answer: 'Yes, we provide REST API access (Business and Enterprise plans) and webhooks for integration with your existing SDLC tools, including Jira, GitHub, Azure DevOps, and Slack. We also support SSO (SAML 2.0, OAuth 2.0) for seamless authentication.'
        },
        {
          question: 'What kind of support do you provide?',
          answer: 'Support levels vary by plan: Starter (email, 48h response), Business (email + chat, 24h response, priority queue), Enterprise (24/7 phone + email + chat, 4h response, dedicated CSM). All plans include access to our knowledge base and documentation.'
        },
        {
          question: 'Do you provide training and onboarding?',
          answer: 'Business and Enterprise plans include comprehensive onboarding sessions. Enterprise customers receive dedicated training for their teams, custom workshops, and ongoing support from a Customer Success Manager. We also offer certification programs for security analysts.'
        },
        {
          question: 'Is there an API for custom integrations?',
          answer: 'Yes, Business and Enterprise plans include full REST API access with comprehensive documentation, SDKs for popular languages (Python, JavaScript, Java), and webhook support for real-time notifications. Enterprise customers can request custom API endpoints.'
        }
      ]
    }
  ];

  return (
    <motion.div {...PAGE_FADE} className="min-h-screen bg-gradient-to-b from-[#0A0E1A] to-[#0F1629] py-20">
      <div className="container mx-auto px-4">
        {/* Header */}
        <Reveal className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#00D4FF]/10 border border-[#00D4FF]/30 mb-6">
            <HelpCircle className="w-4 h-4 text-[#00D4FF]" />
            <span className="text-sm text-[#00D4FF]">Frequently Asked Questions</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
            How Can We{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00D4FF] to-[#00D4D4]">
              Help You?
            </span>
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Find answers to common questions about FortifyLens
          </p>
        </Reveal>

        {/* FAQ Sections */}
        <div className="max-w-4xl mx-auto space-y-8">
          {faqs.map((category, catIndex) => (
            <Reveal key={catIndex} delay={catIndex * 0.06}>
              <Card className="p-8 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#00D4FF] to-[#0A0E1A] flex items-center justify-center">
                    <HelpCircle className="w-5 h-5 text-white" />
                  </div>
                  {category.category}
                </h2>
                
                <Accordion type="single" collapsible className="space-y-4">
                  {category.questions.map((faq, faqIndex) => (
                    <AccordionItem
                      key={faqIndex}
                      value={`${catIndex}-${faqIndex}`}
                      className="border border-[#00D4FF]/20 rounded-lg px-6 bg-white/5"
                    >
                      <AccordionTrigger className="text-white hover:text-[#00D4FF] text-left [&>svg]:duration-[250ms]">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-gray-400 leading-relaxed">
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </Card>
            </Reveal>
          ))}
        </div>

        {/* Still have questions */}
        <Reveal className="mt-16 text-center">
          <Card className="p-12 bg-gradient-to-br from-[#00D4FF]/10 to-[#0A0E1A]/10 border-[#00D4FF]/30 max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-white mb-4">Still Have Questions?</h2>
            <p className="text-gray-300 mb-6">
              Can't find the answer you're looking for? Our support team is here to help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/contact"
                className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 hover:from-[#00D4FF]/90 hover:to-[#00D4FF]/70 text-white font-semibold transition-all"
              >
                Contact Support
              </a>
              <a
                href="/dashboard"
                className="inline-flex items-center justify-center px-8 py-3 rounded-lg border border-[#00D4FF]/50 text-[#00D4FF] hover:bg-[#00D4FF]/10 font-semibold transition-all"
              >
                Start Free Trial
              </a>
            </div>
          </Card>
        </Reveal>
      </div>
    </motion.div>
  );
}
