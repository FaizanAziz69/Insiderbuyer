import { FlowEmail, SIGNOFF_BUYING, cta } from './types';

const H = 60;
const D = 24 * H;

/** New Member Offer / $150-credit flow (site revision item 5) — armed when a
 *  visitor claims the "New Member Offer" popup on the subscribe page. */
export const DISCOUNT_FLOW: FlowEmail[] = [
  {
    id: 'd1',
    offsetMinutes: 5,
    brand: 'INSIDER BUYING',
    signoffTitle: SIGNOFF_BUYING,
    subjects: [
      { subject: 'Your $150 new-member credit is active', preview: 'Apply it before it expires' },
      { subject: '{{FIRSTNAME}}, your $150 credit is waiting', preview: 'Apply it before it expires' },
      { subject: 'You have a $150 credit on Insider Alerts', preview: 'Here’s how to use it' },
    ],
    body: [
      'Hello {{FIRSTNAME}},',
      'Good news — your <strong>$150 new-member credit</strong> is active on your email address.',
      'It applies automatically toward your first year of <strong>Insider Alerts</strong>: full Insider Score rankings, real-time alerts when executives buy their own stock, and every premium report.',
      'One thing to know: the credit is time-limited. Once it expires, it’s gone.',
      `<p>${cta('Apply my $150 credit now')}</p>`,
      'See you on the inside,',
      '__SIGNOFF__',
    ],
  },
  {
    id: 'd2',
    offsetMinutes: 1 * D,
    brand: 'INSIDER BUYING',
    signoffTitle: SIGNOFF_BUYING,
    subjects: [
      { subject: 'You have a credit of $150 that expires soon', preview: 'Don’t leave it on the table' },
      { subject: 'Reminder: your $150 credit expires soon', preview: 'Apply it in one click' },
      { subject: '{{FIRSTNAME}}, don’t lose your $150 credit', preview: 'It expires soon' },
    ],
    body: [
      'Hello {{FIRSTNAME}},',
      'A quick reminder — <strong>you have a credit of $150 that expires soon.</strong>',
      'It covers most of your first year of Insider Alerts: the complete Insider Score rankings, insider-buy alerts the moment executives file, and every premium report we publish.',
      'Members use these signals to follow the money the way insiders do — before the headlines catch up.',
      `<p>${cta('Use my $150 credit before it expires')}</p>`,
      'See you on the inside,',
      '__SIGNOFF__',
    ],
  },
  {
    id: 'd3',
    offsetMinutes: 2 * D,
    brand: 'INSIDER BUYING',
    signoffTitle: SIGNOFF_BUYING,
    subjects: [
      { subject: 'Final notice: your $150 credit expires tonight' },
      { subject: 'Last chance — $150 credit disappears at midnight', preview: 'After that, full price' },
      { subject: '{{FIRSTNAME}}, this is it for your $150 credit' },
    ],
    body: [
      'Hello {{FIRSTNAME}},',
      'This is the last reminder I’ll send about it — <strong>your $150 new-member credit expires tonight.</strong>',
      'After that, the same access goes back to full price.',
      'If you’ve been meaning to follow the insiders instead of the headlines, this is the cheapest that decision will be.',
      `<p>${cta('Claim my $150 credit before midnight')}</p>`,
      'Whatever you decide, I’m glad you’re on the inside.',
      '__SIGNOFF__',
    ],
  },
];
