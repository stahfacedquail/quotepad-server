const getAuthors = (req, res) => {
    new db.Authors()
    .orderBy("value", "ASC")
    .fetch()
    .then(authors => res.send(authors.toJSON()))
    .catch(error => res.send(error));
};

module.exports = {
    getAuthors
};