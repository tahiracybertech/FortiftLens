import { useState } from 'react';
import { Mail, Phone, Send, MessageSquare, CheckCircle2, Loader2 } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { motion } from 'motion/react';
import { PAGE_FADE } from '../../lib/motionPresets';
import { Reveal } from '../components/Reveal';
import { toast } from 'sonner';

const EMAILJS_SERVICE_ID  = 'service_4uox2mc';
const EMAILJS_PUBLIC_KEY  = 'hM4Or39fvXBDj_pnk';
const EMAILJS_TEMPLATE_ID = 'template_dxhu00e';
const CONTACT_EMAIL       = 'fortifylens@gmail.com';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '', email: '', company: '', message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const emailjs = await import('@emailjs/browser');

      // Send ONE email to fortifylens@gmail.com with person's content
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          from_name:  formData.name,
          from_email: formData.email,
          company:    formData.company || 'Not provided',
          message:    formData.message,
          reply_to:   formData.email,
        },
        { publicKey: EMAILJS_PUBLIC_KEY }
      );

      setSent(true);
      toast.success("Message sent! We'll get back to you soon.");
      setFormData({ name: '', email: '', company: '', message: '' });

    } catch (err: any) {
      console.error('EmailJS error:', err);
      // Fallback: open mailto with person's content
      const subject = encodeURIComponent(`FortifyLens Contact: ${formData.name}`);
      const body = encodeURIComponent(
        `Name: ${formData.name}\nEmail: ${formData.email}\nCompany: ${formData.company || 'N/A'}\n\nMessage:\n${formData.message}`
      );
      window.open(`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`);
      toast.info('Opening your email client as backup...');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div {...PAGE_FADE} className="min-h-screen bg-gradient-to-b from-[#0A0E1A] to-[#0F1629] py-20">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
            Get in{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00D4FF] to-[#00D4D4]">Touch</span>
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Have questions about FortifyLens? Our team is here to help.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Contact Form */}
          <div className="lg:col-span-2">
            <Reveal>
              <Card className="p-8 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                {sent ? (
                  <div className="text-center py-12">
                    <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-4" />
                    <h3 className="text-2xl font-bold text-white mb-2">Message Sent!</h3>
                    <p className="text-gray-400 mb-6">
                      We'll reply to <span className="text-[#00D4FF]">{formData.email || 'your email'}</span> within 24 hours.
                    </p>
                    <Button onClick={() => setSent(false)} variant="outline" className="border-[#00D4FF]/50 text-[#00D4FF]">
                      Send Another Message
                    </Button>
                  </div>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold text-white mb-6">Send us a Message</h2>
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <Label className="text-white mb-2 block">Full Name *</Label>
                          <Input required value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Your full name"
                            className="focus-glow bg-white/5 border-[#00D4FF]/20 text-white" />
                        </div>
                        <div>
                          <Label className="text-white mb-2 block">Email Address *</Label>
                          <Input required type="email" value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                            placeholder="you@example.com"
                            className="focus-glow bg-white/5 border-[#00D4FF]/20 text-white" />
                        </div>
                      </div>
                      <div>
                        <Label className="text-white mb-2 block">Company <span className="text-gray-500">(Optional)</span></Label>
                        <Input value={formData.company}
                          onChange={e => setFormData({ ...formData, company: e.target.value })}
                          placeholder="Your Company Name"
                          className="focus-glow bg-white/5 border-[#00D4FF]/20 text-white" />
                      </div>
                      <div>
                        <Label className="text-white mb-2 block">Message *</Label>
                        <Textarea required value={formData.message}
                          onChange={e => setFormData({ ...formData, message: e.target.value })}
                          placeholder="Tell us about your security needs..." rows={6}
                          className="focus-glow bg-white/5 border-[#00D4FF]/20 text-white" />
                      </div>
                      <Button type="submit" disabled={isSubmitting}
                        className="w-full bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 hover:from-[#00D4FF]/90 hover:to-[#00D4FF]/70 text-white border-0 h-12">
                        {isSubmitting
                          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</>
                          : <><Send className="w-4 h-4 mr-2" />Send Message</>}
                      </Button>
                    </form>
                  </>
                )}
              </Card>
            </Reveal>
          </div>

          {/* Contact Info */}
          <div className="space-y-6">
            <Reveal delay={0.06}>
              <Card className="hover-lift p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                <h3 className="text-xl font-semibold text-white mb-4">Contact Information</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#00D4FF]/20 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-5 h-5 text-[#00D4FF]" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-400 mb-1">Email</div>
                      <a href={`mailto:${CONTACT_EMAIL}`} className="text-white hover:text-[#00D4FF] transition-colors">
                        {CONTACT_EMAIL}
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#00D4FF]/20 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-5 h-5 text-[#00D4FF]" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-400 mb-1">Phone</div>
                      {['+92 3362 045841', '+92 3361 835793', '+92 3180 372733'].map(num => (
                        <a key={num} href={`tel:${num.replace(/\s/g, '')}`}
                          className="block text-white hover:text-[#00D4FF] transition-colors">{num}</a>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </Reveal>

            <Reveal delay={0.12}>
              <Card className="hover-lift p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                <h3 className="text-xl font-semibold text-white mb-3">Direct Email</h3>
                <p className="text-gray-400 text-sm mb-4">
                  Prefer to email directly? We usually respond within 24 hours.
                </p>
                <a href={`mailto:${CONTACT_EMAIL}?subject=FortifyLens%20Inquiry`}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-[#00D4FF]/10 border border-[#00D4FF]/30 text-[#00D4FF] hover:bg-[#00D4FF]/20 transition-colors text-sm font-medium">
                  <Mail className="w-4 h-4" />{CONTACT_EMAIL}
                </a>
              </Card>
            </Reveal>

            <Reveal delay={0.18}>
              <Card className="hover-lift p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                <h3 className="text-xl font-semibold text-white mb-3">Response Time</h3>
                <div className="space-y-2">
                  {[
                    { label: 'Email',         time: 'Within 24 hours',       color: 'text-green-400' },
                    { label: 'WhatsApp',       time: 'Within a few hours',    color: 'text-green-400' },
                    { label: 'Demo requests',  time: 'Same business day',     color: 'text-[#00D4FF]' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">{item.label}</span>
                      <span className={`text-sm font-medium ${item.color}`}>{item.time}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </Reveal>
          </div>
        </div>
      </div>
    </motion.div>
  );
}