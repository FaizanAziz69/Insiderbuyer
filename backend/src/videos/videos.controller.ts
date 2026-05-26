import { Controller, Get } from '@nestjs/common';

export interface VideoTopic {
  id: string;
  title: string;
  channel: string;
  category: 'Market' | 'Stocks' | 'Funds' | 'ETFs' | 'Education' | 'Earnings';
  duration: string;
  topic: string;
  hue: number;
}

const TOPICS: VideoTopic[] = [
  {
    id: 'market-wrap',
    title: 'Today’s market wrap',
    channel: 'Live market coverage',
    category: 'Market',
    duration: '8 min',
    topic: 'stock market today live',
    hue: 210,
  },
  {
    id: 'insider-buying-explained',
    title: 'How insider buying signals work',
    channel: 'Investing 101',
    category: 'Education',
    duration: '6 min',
    topic: 'insider buying stock market explained',
    hue: 280,
  },
  {
    id: 'earnings-recap',
    title: 'This week’s earnings highlights',
    channel: 'Earnings desk',
    category: 'Earnings',
    duration: '10 min',
    topic: 'this week earnings stock recap',
    hue: 160,
  },
  {
    id: 'etfs-vs-mutual-funds',
    title: 'ETFs vs mutual funds',
    channel: 'Funds 101',
    category: 'Funds',
    duration: '7 min',
    topic: 'ETFs vs mutual funds explained',
    hue: 30,
  },
  {
    id: 'sector-rotation',
    title: 'Spotting sector rotation early',
    channel: 'Market structure',
    category: 'Market',
    duration: '12 min',
    topic: 'sector rotation stock market',
    hue: 340,
  },
  {
    id: 'reading-form-4',
    title: 'Reading an SEC Form 4 filing',
    channel: 'SEC filings primer',
    category: 'Education',
    duration: '5 min',
    topic: 'SEC Form 4 explained',
    hue: 195,
  },
  {
    id: 'small-cap-stocks',
    title: 'Small-cap stocks — risk vs reward',
    channel: 'Stocks deep-dive',
    category: 'Stocks',
    duration: '11 min',
    topic: 'small cap stocks investing',
    hue: 12,
  },
  {
    id: 'dividend-investing',
    title: 'Dividend investing basics',
    channel: 'Income investing',
    category: 'Stocks',
    duration: '9 min',
    topic: 'dividend stocks investing for beginners',
    hue: 130,
  },
  {
    id: 'fed-rate-decision',
    title: 'How the Fed moves markets',
    channel: 'Macro desk',
    category: 'Market',
    duration: '13 min',
    topic: 'federal reserve interest rates explained',
    hue: 260,
  },
  {
    id: 'etf-flows',
    title: 'Reading ETF flow data',
    channel: 'ETF research',
    category: 'ETFs',
    duration: '8 min',
    topic: 'ETF flows analysis',
    hue: 50,
  },
  {
    id: 'value-vs-growth',
    title: 'Value vs growth stocks',
    channel: 'Investing 101',
    category: 'Stocks',
    duration: '10 min',
    topic: 'value vs growth stocks investing',
    hue: 305,
  },
  {
    id: 'reading-earnings-call',
    title: 'Reading an earnings call transcript',
    channel: 'Earnings desk',
    category: 'Earnings',
    duration: '7 min',
    topic: 'how to read earnings call transcript',
    hue: 180,
  },
];

@Controller('videos')
export class VideosController {
  @Get()
  list() {
    const shuffled = [...TOPICS].sort(() => Math.random() - 0.5);
    return { total: shuffled.length, items: shuffled };
  }
}
