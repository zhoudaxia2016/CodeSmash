/** Mock official test cases keyed by problem id (bundled in GET /problems/:id as `testCases`). */

export type OfficialTestCase = {
  id: string
  problemId: string
  input: string
  expectedOutput: string
}

export const officialTestCasesByProblem: Record<string, OfficialTestCase[]> = {
  '1': [
    {
      id: '1-tc-1',
      problemId: '1',
      input: '[2,7,11,15], 9',
      expectedOutput: '[0,1]',
    },
    {
      id: '1-tc-2',
      problemId: '1',
      input: '[3,2,4], 6',
      expectedOutput: '[1,2]',
    },
    {
      id: '1-tc-3',
      problemId: '1',
      input: '[3,3], 6',
      expectedOutput: '[0,1]',
    },
    {
      id: '1-tc-4',
      problemId: '1',
      input: '[-1,-2,-3,-4,-5], -8',
      expectedOutput: '[2,4]',
    },
    {
      id: '1-tc-5',
      problemId: '1',
      input: '[0,4,3,0], 0',
      expectedOutput: '[0,3]',
    },
    {
      id: '1-tc-6',
      problemId: '1',
      input: '[19,2,7,11,15,8,4,1], 9',
      expectedOutput: '[1,2]',
    },
    {
      id: '1-tc-7',
      problemId: '1',
      input: '[1,5,8,3,12,9,7,4,2,10], 14',
      expectedOutput: '[1,5]',
    },
    {
      id: '1-tc-8',
      problemId: '1',
      input: '[10,20,30,40,50,60], 100',
      expectedOutput: '[3,5]',
    },
    {
      id: '1-tc-9',
      problemId: '1',
      input: '[5,-5,3,2,7,-2], 0',
      expectedOutput: '[0,1]',
    },
    {
      id: '1-tc-10',
      problemId: '1',
      /** 唯一解：仅 1000000+1=1000001（避免两个 500000 对应多组下标） */
      input: '[1000000,999999,1], 1000001',
      expectedOutput: '[0,2]',
    },
    {
      id: '1-tc-11',
      problemId: '1',
      input: '[1,2,50,48,99], 100',
      expectedOutput: '[0,4]',
    },
    {
      id: '1-tc-12',
      problemId: '1',
      input: '[15,7,11,2,4,13,6,8,5,9,10], 26',
      expectedOutput: '[0,2]',
    },
    {
      id: '1-tc-13',
      problemId: '1',
      input: '[0,2,4,6,8,10,12,14,16,18], 20',
      expectedOutput: '[4,6]',
    },
    {
      id: '1-tc-14',
      problemId: '1',
      input: '[4,5,6,7,8,9,10,11,12,13,14,15,16,17,18], 35',
      expectedOutput: '[13,14]',
    },
    {
      id: '1-tc-15',
      problemId: '1',
      input: '[9,8,7,6,5,4,3,2,1,0,-1,-2,-3], -5',
      expectedOutput: '[11,12]',
    },
  ],
  '2': [
    {
      id: '2-tc-1',
      problemId: '2',
      input: '121',
      expectedOutput: 'true',
    },
    {
      id: '2-tc-2',
      problemId: '2',
      input: '-121',
      expectedOutput: 'false',
    },
    {
      id: '2-tc-3',
      problemId: '2',
      input: '10',
      expectedOutput: 'false',
    },
    {
      id: '2-tc-4',
      problemId: '2',
      input: '0',
      expectedOutput: 'true',
    },
  ],
}
