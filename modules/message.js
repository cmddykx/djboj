let Message = syzoj.model('message');
let User = syzoj.model('user');

app.get('/messages', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请先登录。');
 
    const userId = res.locals.user.id;

    const sent = await Message.find({ where: { sender_id: userId } });
    const received = await Message.find({ where: { receiver_id: userId } });
 
    const partnerIds = new Set();
    for (const m of sent) partnerIds.add(m.receiver_id);
    for (const m of received) partnerIds.add(m.sender_id);
 
    const partners = [];
    for (const pid of partnerIds) {
      const user = await User.findById(pid);
      if (user) partners.push(user);
    }
 
    res.render('messages', { partners });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});

app.get('/message/:username', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请先登录。');
 
    const partner = await User.findOne({ where: { username: req.params.username } });
    if (!partner) throw new ErrorMessage('用户不存在。');
 
    const userId = res.locals.user.id;
 
    const messages = await Message.createQueryBuilder()
      .where('(sender_id = :uid AND receiver_id = :pid) OR (sender_id = :pid AND receiver_id = :uid)', {
        uid: userId, pid: partner.id
      })
      .orderBy('send_time', 'ASC')
      .getMany();

    for (const m of messages) {
      if (m.receiver_id === userId && !m.is_read) {
        m.is_read = true;
        await m.save();
      }
    }
 
    res.render('message', { partner, messages });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});

app.post('/message/:username', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请先登录。');
 
    const partner = await User.findOne({ where: { username: req.params.username } });
    if (!partner) throw new ErrorMessage('用户不存在。');
 
    if (!req.body.content || !req.body.content.trim()) throw new ErrorMessage('内容不能为空。');
 
    const msg = await Message.create({
      sender_id: res.locals.user.id,
      receiver_id: partner.id,
      content: req.body.content.trim(),
      is_read: false,
      send_time: parseInt(Date.now() / 1000)
    });
    await msg.save();
 
    res.redirect(syzoj.utils.makeUrl(['message', req.params.username]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});