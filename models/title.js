const findTitleById = (req, res) => {
    if(req.query) {
        if(req.query.full) {
            return joinTitleWithAuthors(req, res);
        }
    }

    new db.Title({ id: req.params.id }).fetch({ require: false }).then(title => {
        res.send(title ? title.toJSON() : null);
    });
};

const joinTitleWithAuthors = (req, res) => {
    new db.Title({ id: req.params.id }).fetch({ require: false, withRelated: [ "type", "authors" ]})
    .then(title => {
        res.send(title ? title.toJSON() : null);
    })
    .catch(error => res.send(error));
};

const getTitles = (req, res) => {
    let options = {};
    if(req.query.full)
        options.withRelated = [ "type", "authors" ];

    new db.Titles()
    .orderBy("value", "ASC")
    .fetch(options)
    .then(titles => res.send(titles.toJSON()))
    .catch(error => res.send(error));
};

module.exports = {
    findTitleById,
    getTitles
};