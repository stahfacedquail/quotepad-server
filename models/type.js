const getTypes = (req, res) => {
    new db.TitleTypes()
    .orderBy("value", "ASC")
    .fetch()
    .then(types => res.send(types.toJSON()))
    .catch(error => res.send(error));
};

module.exports = {
    getTypes
};