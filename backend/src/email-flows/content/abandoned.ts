import { FlowEmail, SIGNOFF_BUYING, cta, quote } from './types';

const H = 60;
const D = 24 * H;

/** Abandoned Order Form Flow — verbatim. Starts when a checkout is opened
 *  but not completed. */
export const ABANDONED_FLOW: FlowEmail[] = [
  {
    id: 'a1',
    offsetMinutes: 60, // fires an hour after the abandoned checkout
    brand: 'INSIDER BUYING',
    signoffTitle: SIGNOFF_BUYING,
    subjects: [
      { subject: 'Where did you go?' },
      { subject: 'You were just one click away…' },
      { subject: 'What happened {{FIRSTNAME}}?' },
      { subject: 'Here’s your way back inside' },
      { subject: 'Trump’s allies are moving… so should you' },
      { subject: 'Here’s your way back in' },
    ],
    body: [
      'Hello {{FIRSTNAME}},',
      'You were right there… just a click from capitalizing on LIT',
      'And flipping the script on the rigged market.',
      'Maybe something held you back… and I don’t want you to miss this opportunity.',
      `<p>${cta('Here’s your way back in')}</p>`,
      'You will be getting real data from a ‘legal insider tip’ system I built to tap in to quality insider moves.',
      'You are about to unlock complete access.',
      `<p>${cta('Here’s your way back in {{FIRSTNAME}}')}</p>`,
      'See you on the inside,',
      '__SIGNOFF__',
    ],
  },
  {
    id: 'a2',
    offsetMinutes: 1 * D,
    brand: 'INSIDER BUYING',
    signoffTitle: SIGNOFF_BUYING,
    subjects: [
      { subject: 'The system is rigged…' },
      { subject: 'How you can beat the rigged market' },
      { subject: 'Flip the script on the elites with this.' },
      { subject: 'Do you have the courage to flip the script on the elites?' },
      { subject: 'Beat the rigged market with this.' },
    ],
    body: [
      '<p><strong>Hello {{FIRSTNAME}},</strong></p>',
      'You already know the system is rigged…',
      'And most Americans never get the chance to follow the money the right way. And it’s not because it’s a secret…',
      'But because it’s buried deep in Form 4 and 13 F filings.',
      'And when you do find these documents, it’s hard to know which trades to follow and which to avoid like a plague.',
      'That’s how the elites like it. They trade early while we come in late.',
      'But that’s what my <strong>“Legal Inside Tip,” LIT</strong> changes…',
      'It’s the system I built after I was used as exit liquidity for insiders who were dumping their shares.',
      'Following the same principles LIT was built to consider could have handed anyone windfalls like…',
      '<ul style="margin:12px 0 16px;padding-left:24px;">' +
        '<li style="margin:8px 0;">2000% on SilverCrest Metals (Ticker: SILV )</li>' +
        '<li style="margin:8px 0;">1300% on Kulr Technologies Group (Ticker: KULR)</li>' +
        '<li style="margin:8px 0;">2800% on Emerita Resources (Ticker: EMO)</li></ul>',
      '$10,000 in each trade would have landed you a $610,000 retirement nest egg.',
      'And as you continue to follow only the right insider moves…',
      'You stand a chance to secure freedom and spend more quality time with your family',
      'And in the next few minutes…',
      'You could get access to LIT…',
      `<p>${cta('Flip the script on the elites right here')}</p>`,
      '– See you on the inside,',
      '__SIGNOFF__',
    ],
  },
  {
    id: 'a3',
    offsetMinutes: 2 * D,
    brand: 'INSIDER BUYING',
    signoffTitle: SIGNOFF_BUYING,
    subjects: [
      { subject: 'It doesn’t matter what the narrative from the Media is…', preview: 'Here’s what does' },
      { subject: 'Your path to beating the market starts here' },
      { subject: 'You could beat the market.. Here’s how…' },
      { subject: 'Beat the rigged market? Here’s how' },
      { subject: 'Here’s how you could beat the market' },
    ],
    body: [
      'Hello {{FIRSTNAME}},',
      `<p>${cta('Here’s how you could beat the market.')}</p>`,
      'You see,',
      'No matter what the narrative about the economy in the media is…',
      'You could take your freedom into your own hands…',
      `<p>And spend more quality time with your family… ${cta('by following the money.')}</p>`,
      'Research from Harvard proves insiders beat the market by double digits annually.',
      'Legendary Investor Peter Lynch said,',
      quote('“Insiders might sell their stock for any number of reasons, but they buy them for only one… they think the price will rise.”'),
      'Tell me,',
      'How does it feel to flip the script on the rigged market?',
      `<p>${cta('Your path to beating the market starts here.')}</p>`,
      'See you on the inside,',
      '__SIGNOFF__',
    ],
  },
];
