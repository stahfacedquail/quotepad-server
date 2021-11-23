const getTags = (req, res) => {
    new db.Tags()
    .orderBy("value", "ASC")
    .fetch()
    .then(tags => res.send(tags.toJSON()))
    .catch(error => res.send(error));
};

const createTag = (tag, trx) => {
    return new db.Tag().save({ value: tag.value }, { transacting: trx });
};

const cleanUpZombieTags = trx => {
    return trx.raw(
        "SELECT id FROM tags " +
        "WHERE id NOT IN ( SELECT tag_id FROM quote_tags );"
    ).then(quotelessTags => {
        quotelessTags = quotelessTags.rows;
        //console.log("Delete these quoteless tags", quotelessTags)

        if(quotelessTags.length == 0)
            return Promise.resolve(null);

        quotelessTags = quotelessTags.map(tag =>
            new db.Tag()
            .where({ id: tag.id })
            .destroy({ transacting: trx })
        );

        return Promise.all(quotelessTags);
    });
};

module.exports = {
    getTags,
    createTag,
    cleanUpZombieTags
};