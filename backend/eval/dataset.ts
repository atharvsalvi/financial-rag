export const reports = [
  {
    year: 2022,
    hash: '52138f7464c477b10bf5068b8a211f059f8b90ba6b9c4d16c8ee434193a70be4',
    url: 'https://www.berkshirehathaway.com/2022ar/2022ar.pdf',
  },
  {
    year: 2023,
    hash: '2132b85f9c472a6f0b141551adb08d93f88db28e6a3794e7e2b13ca3f8a57b5b',
    url: 'https://www.berkshirehathaway.com/2023ar/2023ar.pdf',
  },
] as const;

export interface Case {
  id: string;
  question: string;
  report: 2022 | 2023;
  year: number;
  pages: number[];
  alternate?: { report: 2022 | 2023; pages: number[] };
  amountMillions?: number;
  metric?: string;
  thread?: string;
  scoped?: boolean;
}
// Amounts are USD millions. Pages count physical PDF pages starting at one.
export const cases: Case[] = [
  {
    id: 'float23',
    thread: 'float',
    question:
      'How large was Berkshire Hathaway’s insurance float at December 31, 2023?',
    report: 2023,
    year: 2023,
    pages: [30, 66],
    amountMillions: 169000,
    metric: 'float',
  },
  {
    id: 'float22-follow',
    thread: 'float',
    question: 'And how large was it at the end of the previous year?',
    report: 2023,
    year: 2022,
    pages: [66],
    alternate: { report: 2022, pages: [22, 57] },
    amountMillions: 164000,
    metric: 'float',
  },
  {
    id: 'cash22',
    scoped: true,
    question:
      'In the original FY2022 consolidated statement, what were Berkshire’s net cash flows from operating activities in 2022?',
    report: 2022,
    year: 2022,
    pages: [90],
    amountMillions: 37224,
    metric: 'operating activities',
  },
  {
    id: 'cash23',
    scoped: true,
    thread: 'cash',
    question:
      'What were consolidated net cash flows from operating activities in FY2023?',
    report: 2023,
    year: 2023,
    pages: [98],
    amountMillions: 49196,
    metric: 'operating activities',
  },
  {
    id: 'cash22-comparative',
    scoped: true,
    thread: 'cash',
    question: 'What comparative amount does that same statement give for 2022?',
    report: 2023,
    year: 2022,
    pages: [98],
    amountMillions: 37350,
    metric: 'operating activities',
  },
  {
    id: 'bhe22',
    question:
      'What net earnings were attributable to BHE in FY2022, in millions of dollars?',
    report: 2022,
    year: 2022,
    pages: [60, 61],
    alternate: { report: 2023, pages: [69] },
    amountMillions: 4352,
    metric: 'BHE',
  },
  {
    id: 'bhe23',
    question:
      'What net earnings were attributable to BHE in FY2023, in millions of dollars?',
    report: 2023,
    year: 2023,
    pages: [69],
    amountMillions: 2610,
    metric: 'BHE',
  },
  {
    id: 'deferred22',
    question:
      'At year-end 2022, how much were unamortized deferred charges related to retroactive reinsurance contracts?',
    report: 2022,
    year: 2022,
    pages: [55, 78, 115],
    alternate: { report: 2023, pages: [123] },
    amountMillions: 9900,
    metric: 'deferred charges',
  },
  {
    id: 'deferred23',
    question:
      'At year-end 2023, how much were unamortized deferred charges on retroactive reinsurance contracts?',
    report: 2023,
    year: 2023,
    pages: [65, 86, 123],
    amountMillions: 9500,
    metric: 'deferred charges',
  },
  {
    id: 'losses22',
    question:
      'How large were gross unpaid losses assumed under retroactive reinsurance contracts at December 31, 2022?',
    report: 2022,
    year: 2022,
    pages: [55, 78],
    amountMillions: 35400,
    metric: 'unpaid losses',
  },
  {
    id: 'losses23',
    thread: 'unpaid-losses',
    question:
      'How large were unpaid losses assumed under retroactive reinsurance contracts at December 31, 2023?',
    report: 2023,
    year: 2023,
    pages: [65, 86],
    amountMillions: 34600,
    metric: 'unpaid losses',
  },
  {
    id: 'losses22-follow',
    thread: 'unpaid-losses',
    question: 'What was the corresponding amount at the end of 2022?',
    report: 2022,
    year: 2022,
    pages: [55, 78],
    amountMillions: 35400,
    metric: 'unpaid losses',
  },
  {
    id: 'debt22',
    scoped: true,
    question:
      'How much did BHE and its subsidiaries have in outstanding borrowings at the end of 2022?',
    report: 2022,
    year: 2022,
    pages: [74],
    amountMillions: 52800,
    metric: 'borrowings',
  },
  {
    id: 'asbestos23',
    scoped: true,
    question:
      'What was Berkshire’s estimated liability for asbestos and environmental exposures at December 31, 2023?',
    report: 2023,
    year: 2023,
    pages: [87, 123],
    amountMillions: 12200,
    metric: 'environmental',
  },
  {
    id: 'energy22',
    scoped: true,
    question: 'How much energy operating revenue did BHE report for FY2022?',
    report: 2022,
    year: 2022,
    pages: [60],
    amountMillions: 21069,
    metric: 'energy operating revenue',
  },
  {
    id: 'energy23',
    scoped: true,
    question: 'How much energy operating revenue did BHE report for FY2023?',
    report: 2023,
    year: 2023,
    pages: [69],
    amountMillions: 21280,
    metric: 'energy operating revenue',
  },
  {
    id: 'absent25',
    question:
      'What actual consolidated net income did Berkshire record for the completed fiscal year 2025?',
    report: 2023,
    year: 2025,
    pages: [],
  },
  {
    id: 'absent26',
    question:
      'What was BNSF’s actual operating revenue for the completed fiscal year 2026?',
    report: 2022,
    year: 2026,
    pages: [],
  },
];
