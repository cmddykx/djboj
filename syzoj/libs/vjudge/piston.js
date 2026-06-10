const request = require('request-promise');
const fs = require('fs-extra');
const path = require('path');
 
const JUDGE0_API = 'https://ce.judge0.com';
 
const LANGUAGE_MAP = {
  'cpp':        { id: 105, highlight: 'cpp' },
  'cpp14':      { id: 54,  highlight: 'cpp' },
  'c':          { id: 103, highlight: 'c' },
  'python3':    { id: 113, highlight: 'python' },
  'python2':    { id: 70,  highlight: 'python' },
  'java':       { id: 91,  highlight: 'java' },
  'javascript': { id: 102, highlight: 'javascript' },
  'typescript': { id: 101, highlight: 'typescript' },
  'rust':       { id: 108, highlight: 'rust' },
  'go':         { id: 107, highlight: 'golang' },
  'kotlin':     { id: 111, highlight: 'kotlin' },
  'scala':      { id: 112, highlight: 'scala' },
  'csharp':     { id: 51,  highlight: 'csharp' },
  'php':        { id: 98,  highlight: 'php' },
  'ruby':       { id: 72,  highlight: 'ruby' },
  'swift':      { id: 83,  highlight: 'swift' },
  'bash':       { id: 46,  highlight: 'bash' },
  'lua':        { id: 64,  highlight: 'lua' },
  'r':          { id: 99,  highlight: 'r' },
  'pascal':     { id: 67,  highlight: 'pascal' },
  'haskell':    { id: 61,  highlight: 'haskell' },
  'perl':       { id: 85,  highlight: 'perl' },
  'dart':       { id: 90,  highlight: 'dart' },
  'ocaml':      { id: 65,  highlight: 'ocaml' },
};
 
module.exports = async function vjudge(judge_state, problem, onProgress) {
  const taskId = judge_state.task_id;
 
  onProgress({ taskId, type: 0, progress: null });
  onProgress({ taskId, type: 2, progress: { status: 2, message: '' } });
 
  setImmediate(async () => {
    try {
      const lang = LANGUAGE_MAP[judge_state.language];
      if (!lang) {
        return onProgress({
          taskId, type: 4,
          progress: { error: 0, systemMessage: 'Unsupported language' }
        });
      }
 
      const testdataPath = problem.getTestdataPath();
      let testcases = [];
 
      if (await fs.pathExists(testdataPath)) {
        const files = await fs.readdir(testdataPath);
        const inputs = files.filter(f => f.endsWith('.in')).sort();
        for (const inFile of inputs) {
          const baseName = inFile.slice(0, -3);
          const outFile = baseName + '.out';
          if (files.includes(outFile)) {
            testcases.push({
              input: await fs.readFile(path.join(testdataPath, inFile), 'utf8'),
              output: (await fs.readFile(path.join(testdataPath, outFile), 'utf8')).trim()
            });
          }
        }
      }
 
      if (testcases.length === 0) {
        testcases.push({
          input: '',
          output: (problem.vjudge_config || '').trim()
        });
      }
 
      const scorePerCase = Math.floor(100 / testcases.length);
      const lastCaseScore = 100 - scorePerCase * (testcases.length - 1);
      const cases = [];
      let totalScore = 0;
      let compileError = '';
 
      for (let i = 0; i < testcases.length; i++) {
        const { input, output: expectedOutput } = testcases[i];
 
        let response;
        try {
          response = await request({
            method: 'POST',
            uri: JUDGE0_API + '/submissions/?wait=true',
            json: true,
            headers: { 'Content-Type': 'application/json' },
            body: {
              source_code: judge_state.code,
              language_id: lang.id,
              stdin: input,
              cpu_time_limit: (problem.time_limit || 1000) / 1000,
              memory_limit: (problem.memory_limit || 256) * 1024
            },
            timeout: 300000
          });
        } catch (e) {
          cases.push({
            status: 2,
            result: {
              type: 9, time: 0, memory: 0,
              scoringRate: 0, userOutput: '', userError: '',
              systemMessage: 'Judge0 request failed: ' + e.message
            }
          });
          continue;
        }
 
        let resultType = 1, userOutput = '', userError = '';
 
        // 编译错误
        if (response.compile_output) {
          compileError = response.compile_output;
          for (let j = i; j < testcases.length; j++) {
            cases.push({
              status: 2,
              result: {
                type: 4, time: 0, memory: 0,
                scoringRate: 0, userOutput: '', userError: compileError, systemMessage: ''
              }
            });
          }
          break;
        }
 
        // 运行时错误
        if (response.status.id >= 5 && response.status.id <= 8) {
          if (response.status.id === 5) resultType = 3;       // TLE
          else if (response.status.id === 6) resultType = 6;  // MLE
          else resultType = 8;                                  // RE
          userError = response.stderr || response.message || '';
        } else {
          userOutput = (response.stdout || '').trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
console.log('expected:', JSON.stringify(expectedOutput));
console.log('actual:  ', JSON.stringify(userOutput));
          if (expectedOutput && userOutput !== expectedOutput) {
            resultType = 2; // WA
          }
        }
 
        const isAC = resultType === 1;
        const caseScore = isAC ? (i === testcases.length - 1 ? lastCaseScore : scorePerCase) : 0;
        totalScore += caseScore;
 
        cases.push({
          status: 2,
          result: {
            type: resultType,
            time: Math.round((parseFloat(response.time) || 0) * 1000),
            memory: (response.memory || 0) * 1024,
            scoringRate: isAC ? 1 : 0,
            userOutput,
            userError,
            systemMessage: ''
          }
        });
 
        onProgress({
          taskId, type: 3,
          progress: {
            compile: { status: 2, message: compileError },
            judge: {
              subtasks: [{
                score: totalScore,
                cases: cases.slice()
              }]
            }
          }
        });
      }

      onProgress({
        taskId, type: 4,
        progress: {
          compile: { status: compileError ? 3 : 2, message: compileError },
          judge: {
            subtasks: [{
              score: totalScore,
              cases: cases
            }]
          }
        }
      });
 
    } catch (e) {
      onProgress({
        taskId, type: 4,
        progress: { error: 0, systemMessage: e.message }
      });
    }
  });
};
 
module.exports.languages = {
  'cpp':        { index: 0,  show: 'C++ (GCC 14.1.0)',       highlight: 'cpp',        editor: 'cpp'        },
  'cpp14':      { index: 1,  show: 'C++ (GCC 9.2.0)',        highlight: 'cpp',        editor: 'cpp'        },
  'c':          { index: 2,  show: 'C (GCC 14.1.0)',         highlight: 'c',          editor: 'c'          },
  'python3':    { index: 3,  show: 'Python 3.14',            highlight: 'python',     editor: 'python'     },
  'python2':    { index: 4,  show: 'Python 2.7',             highlight: 'python',     editor: 'python'     },
  'java':       { index: 5,  show: 'Java (JDK 17)',          highlight: 'java',       editor: 'java'       },
  'javascript': { index: 6,  show: 'JavaScript (Node 22)',   highlight: 'javascript', editor: 'javascript' },
  'typescript': { index: 7,  show: 'TypeScript 5.6',         highlight: 'typescript', editor: 'typescript' },
  'rust':       { index: 8,  show: 'Rust 1.85',              highlight: 'rust',       editor: 'rust'       },
  'go':         { index: 9,  show: 'Go 1.23',                highlight: 'golang',     editor: 'go'         },
  'kotlin':     { index: 10, show: 'Kotlin 2.1',             highlight: 'kotlin',     editor: 'kotlin'     },
  'scala':      { index: 11, show: 'Scala 3.4',              highlight: 'scala',      editor: 'scala'      },
  'csharp':     { index: 12, show: 'C# (Mono)',              highlight: 'csharp',     editor: 'csharp'     },
  'php':        { index: 13, show: 'PHP 8.3',                highlight: 'php',        editor: 'php'        },
  'ruby':       { index: 14, show: 'Ruby 2.7',               highlight: 'ruby',       editor: 'ruby'       },
  'swift':      { index: 15, show: 'Swift 5.2',              highlight: 'swift',      editor: 'swift'      },
  'bash':       { index: 16, show: 'Bash 5.0',               highlight: 'bash',       editor: 'bash'       },
  'lua':        { index: 17, show: 'Lua 5.3',                highlight: 'lua',        editor: 'lua'        },
  'r':          { index: 18, show: 'R 4.4',                  highlight: 'r',          editor: 'r'          },
  'pascal':     { index: 19, show: 'Pascal (FPC)',            highlight: 'pascal',     editor: 'pascal'     },
  'haskell':    { index: 20, show: 'Haskell (GHC)',          highlight: 'haskell',    editor: 'haskell'    },
  'perl':       { index: 21, show: 'Perl 5.28',              highlight: 'perl',       editor: 'perl'       },
  'dart':       { index: 22, show: 'Dart 2.19',              highlight: 'dart',       editor: 'dart'       },
  'ocaml':      { index: 23, show: 'OCaml 4.09',             highlight: 'ocaml',      editor: 'ocaml'      },
};