const luogu = require("./vjudge/lugou");
const piston = require("./vjudge/piston");
 
module.exports = function vjudge(judge_state, problem, onProgress) {
  if (problem.type === "vjudge:luogu") return luogu(judge_state, problem, onProgress);
  if (problem.type === "vjudge:piston") return piston(judge_state, problem, onProgress);
};
 
module.exports.languages = {
  luogu: luogu.languages,
  piston: piston.languages
};