let User = syzoj.model('user');
const RatingHistory = syzoj.model('rating_history');
const Contest = syzoj.model('contest');
const ContestPlayer = syzoj.model('contest_player');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');
 
function getAvatarUrl(user) {
  return user.avatar || ('https://www.gravatar.com/avatar/' + crypto.createHash('md5').update((user.email || '').trim().toLowerCase()).digest('hex') + '?s=80&d=identicon');
}
 
// Ranklist
app.get('/ranklist', async (req, res) => {
  try {
    const sort = req.query.sort || syzoj.config.sorting.ranklist.field;
    const order = req.query.order || syzoj.config.sorting.ranklist.order;
    if (!['ac_num', 'rating', 'id', 'username'].includes(sort) || !['asc', 'desc'].includes(order)) {
      throw new ErrorMessage('错误的排序参数。');
    }
    let paginate = syzoj.utils.paginate(await User.countForPagination({ is_show: true }), req.query.page, syzoj.config.page.ranklist);
    let ranklist = await User.queryPage(paginate, { is_show: true }, { [sort]: order.toUpperCase() });
    await ranklist.forEachAsync(async x => x.renderInformation());
 
    res.render('ranklist', {
      ranklist: ranklist,
      paginate: paginate,
      curSort: sort,
      curOrder: order === 'asc'
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
 
app.get('/find_user', async (req, res) => {
  try {
    let user = await User.fromName(req.query.nickname);
    if (!user) throw new ErrorMessage('无此用户。');
    res.redirect(syzoj.utils.makeUrl(['user', user.id]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
 
// Login
app.get('/login', async (req, res) => {
  if (res.locals.user) {
    res.render('error', {
      err: new ErrorMessage('您已经登录了，请先注销。', { '注销': syzoj.utils.makeUrl(['logout'], { 'url': req.originalUrl }) })
    });
  } else {
    res.render('login');
  }
});
 
// Sign up
app.get('/sign_up', async (req, res) => {
  if (res.locals.user) {
    res.render('error', {
      err: new ErrorMessage('您已经登录了，请先注销。', { '注销': syzoj.utils.makeUrl(['logout'], { 'url': req.originalUrl }) })
    });
  } else {
    res.render('sign_up');
  }
});
 
// Logout
app.post('/logout', async (req, res) => {
  req.session.user_id = null;
  res.clearCookie('login');
  res.redirect(req.query.url || '/');
});
 
// User page
app.get('/user/:id', async (req, res) => {
  try {
    let id = parseInt(req.params.id);
    let user = await User.findById(id);
    if (!user) throw new ErrorMessage('无此用户。');
    user.ac_problems = await user.getACProblems();
    user.articles = await user.getArticles();
    user.allowedEdit = await user.isAllowedEditBy(res.locals.user);
 
    let statistics = await user.getStatistics();
    await user.renderInformation();
    user.emailVisible = user.public_email || user.allowedEdit;
 
    const ratingHistoryValues = await RatingHistory.find({
      where: { user_id: user.id },
      order: { rating_calculation_id: 'ASC' }
    });
    const ratingHistories = [{
      contestName: "初始积分",
      value: syzoj.config.default.user.rating,
      delta: null,
      rank: null
    }];
 
    for (const history of ratingHistoryValues) {
      const contest = await Contest.findById((await RatingCalculation.findById(history.rating_calculation_id)).contest_id);
      ratingHistories.push({
        contestName: contest.title,
        value: history.rating_after,
        delta: history.rating_after - ratingHistories[ratingHistories.length - 1].value,
        rank: history.rank,
        participants: await ContestPlayer.count({ contest_id: contest.id })
      });
    }
    ratingHistories.reverse();
 
    res.render('user', {
      show_user: user,
      statistics: statistics,
      ratingHistories: ratingHistories,
      avatarUrl: getAvatarUrl(user)
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
 
app.get('/user/:id/edit', async (req, res) => {
  try {
    let id = parseInt(req.params.id);
    let user = await User.findById(id);
    if (!user) throw new ErrorMessage('无此用户。');
 
    let allowedEdit = await user.isAllowedEditBy(res.locals.user);
    if (!allowedEdit) throw new ErrorMessage('您没有权限进行此操作。');
 
    user.privileges = await user.getPrivileges();
    res.locals.user.allowedManage = await res.locals.user.hasPrivilege('manage_user');
 
    res.render('user_edit', {
      edited_user: user,
      error_info: null,
      avatarUrl: getAvatarUrl(user)
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
 
app.get('/forget', async (req, res) => {
  res.render('forget');
});
 
app.post('/user/:id/edit', app.multer.fields([{ name: 'avatar', maxCount: 1 }]), async (req, res) => {
  let user;
  try {
    let id = parseInt(req.params.id);
    user = await User.findById(id);
    if (!user) throw new ErrorMessage('无此用户。');
 
    let allowedEdit = await user.isAllowedEditBy(res.locals.user);
    if (!allowedEdit) throw new ErrorMessage('您没有权限进行此操作。');
 
    if (req.body.old_password && req.body.new_password) {
      if (user.password !== req.body.old_password && !await res.locals.user.hasPrivilege('manage_user')) throw new ErrorMessage('旧密码错误。');
      user.password = req.body.new_password;
    }
 
    if (res.locals.user && await res.locals.user.hasPrivilege('manage_user')) {
      if (!syzoj.utils.isValidUsername(req.body.username)) throw new ErrorMessage('无效的用户名。');
      user.username = req.body.username;
      user.email = req.body.email;
    }
 
    if (res.locals.user && res.locals.user.is_admin) {
      if (!req.body.privileges) {
        req.body.privileges = [];
      } else if (!Array.isArray(req.body.privileges)) {
        req.body.privileges = [req.body.privileges];
      }
      await user.setPrivileges(req.body.privileges);
    }
 
    user.information = req.body.information;
    user.sex = req.body.sex;
    user.public_email = (req.body.public_email === 'on');
    user.prefer_formatted_code = (req.body.prefer_formatted_code === 'on');
 
    if (req.files && req.files['avatar']) {
      const avatarFile = req.files['avatar'][0];
      const ext = path.extname(avatarFile.originalname).toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) throw new ErrorMessage('头像格式不支持。');
      if (avatarFile.size > 2 * 1024 * 1024) throw new ErrorMessage('头像不能超过 2MB。');
      const avatarDir = path.join(__dirname, '..', 'static', 'uploads', 'avatars');
      await fs.ensureDir(avatarDir);
      const avatarPath = '/uploads/avatars/' + user.id + ext;
      await fs.ensureDir(avatarDir);
      await fs.move(avatarFile.path, path.join(avatarDir, user.id + ext), { overwrite: true });
      user.avatar = avatarPath;
    }
 
    await user.save();
 
    if (user.id === res.locals.user.id) res.locals.user = user;
 
    user.privileges = await user.getPrivileges();
    res.locals.user.allowedManage = await res.locals.user.hasPrivilege('manage_user');
 
    res.render('user_edit', {
      edited_user: user,
      error_info: '',
      avatarUrl: getAvatarUrl(user)
    });
  } catch (e) {
    try {
      if (user) user.privileges = await user.getPrivileges();
      if (res.locals.user) res.locals.user.allowedManage = await res.locals.user.hasPrivilege('manage_user');
    } catch (e) {
      console.error(e);
    }
 
    res.render('user_edit', {
      edited_user: user,
      error_info: e.message,
      avatarUrl: user ? getAvatarUrl(user) : ''
    });
  }
});