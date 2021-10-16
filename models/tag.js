const getTags = (req, res) => {
    new db.Tags()
    .orderBy("value", "ASC")
    .fetch()
    .then(tags => res.send(tags.toJSON()))
    .catch(error => res.send(error));
};

module.exports = {
    getTags
};