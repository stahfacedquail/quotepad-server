const findTitleById = (req, res) => {
    new db.Title({ id: req.params.id }).fetch({ require: false }).then(title => {
        res.send(title ? title.toJSON() : null);
    });
};

module.exports = {
    findTitleById
};