import pymysql

pymysql.install_as_MySQLdb()
# Django 6's mysql backend requires mysqlclient >= 2.2.1; PyMySQL is compatible but reports a lower version_info.
pymysql.version_info = (2, 2, 1, "final", 0)
