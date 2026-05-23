const request = require('request-promise');
 
const WANDBOX_API = 'https://wandbox.org/api/compile.json';
 
const COMPILER_MAP = {
  'cpp':        'gcc-head',
  'c':          'gcc-head-c',
  'python':     'cpython-head',
  'java':       'openjdk-jdk-16+36',
  'javascript': 'nodejs-16.3.0',
};
 
module.exports = async function vjudge(judge_state, problem, onProgress) {
  const taskId = judge_state.task_id;
 
  onProgress({
    taskId,
    type: 2,
    progress: { status: 2, message: '' }
  });
 
  try {
    const compiler = COMPILER_MAP[judge_state.language] || 'gcc-head';
 
    const response = await request({
      method: 'POST',
      uri: WANDBOX_API,
      json: true,
      body: {
        compiler: compiler,
        code: judge_state.code,
        stdin: problem.vjudge_stdin || ''
      }
    });

    const expectedOutput = (problem.vjudge_config || '').replace(/\r\n/g, '\n').trimEnd();
    const actualOutput = (response.program_output || '').replace(/\r\n/g, '\n').trimEnd();
 
    let resultType;
    if (response.status !== '0') {
      resultType = 8;
    } else if (!expectedOutput) {
      resultType = 1;
    } else {
      resultType = actualOutput === expectedOutput ? 1 : 2;
    }
 
    const success = resultType === 1;
 
    onProgress({
      taskId,
      type: 4,
      progress: {
        compile: {
          status: 2,
          message: response.compiler_error || ''
        },
        judge: {
          subtasks: [{
            score: success ? 100 : 0,
            cases: [{
              status: 2,
              result: {
                type: resultType,
                time: 0,
                memory: 0,
                scoringRate: success ? 1 : 0,
                userOutput: actualOutput,
                userError: response.program_error || '',
                systemMessage: ''
              }
            }]
          }]
        }
      }
    });
  } catch (e) {
    onProgress({
      taskId,
      type: 4,
      progress: {
        error: 0,
        systemMessage: e.message
      }
    });
  }
};
 
module.exports.languages = {
  'cpp':        { index: 0, show: 'C++ (GCC)',        highlight: 'cpp',        editor: 'cpp',        format: 'cpp' },
  'c':          { index: 1, show: 'C (GCC)',           highlight: 'c',          editor: 'c',          format: 'c'   },
  'python':     { index: 2, show: 'Python 3',          highlight: 'python',     editor: 'python'                    },
  'javascript': { index: 3, show: 'JavaScript (Node)', highlight: 'javascript', editor: 'javascript'                },
  'java':       { index: 4, show: 'Java',              highlight: 'java',       editor: 'java'                      },
};